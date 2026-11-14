"""[AI-assisted: written with Claude, reviewed and validated by the team.]
GPU (CUDA via CuPy) version of heatmap.py: the same method, the same grid, the same output files.

Method (identical to heatmap.py / horizon.py, see there for the definitions):
  * horizon per cell: 720 azimuth bins, great-circle march on the LOLA 80 m DEM up to 150 km,
    step max(s/2, min(0.25 % of range, 4 s)), bilinear heights, stop at the DEM edge;
  * observer 2 m above the surface; Sun % = mean visible disk fraction, Earth % = share of hours
    with Earth centre > horizon + 1 deg, longest night = longest run of hours with the disk fully hidden;
  * first 12 months of static/data/ephem.bin (hourly SPICE ephemeris).

Numerics: the horizon march runs in float32 but avoids the large-number cancellation of
(R + h) - R: the vertical offset is written as -2 R sin^2(th/2) + h cos th - h0 - H and the map
position comes straight from the unit vector (stereographic: x = 2R vy / (1 - vz), y = 2R vx / (1 - vz)).
The per-hour Sun/Earth metrics run in float64. `--validate N` compares N random cells with the CPU
reference (heatmap._grid) and prints the differences.

Usage: python heatmap_gpu.py [--cell-km 1.0] [--validate 400]
"""
from __future__ import annotations

import json
import math
import sys
import time
import warnings

import numpy as np

warnings.filterwarnings("ignore", message="CUDA path could not be detected")
import cupy as cp  # noqa: E402

from common import MOON_R_M, OUT, SUN_R_KM  # noqa: E402
from heatmap import EARTH_MARGIN, HALF_KM, MAX_DIST, N_AZ_MAP, OBS_H, load_year  # noqa: E402
from lola import open_dem, xy_to_latlon  # noqa: E402

SRC = r"""
#define R_M @R@
#define SUN_R_KM @SUNR@
#define AU_KM 149597870.7
#define PI_D 3.141592653589793

__device__ __forceinline__ float height_xy(const short* __restrict__ dn, int n, float scale, float x, float y, bool* ok) {
    float col = x / scale + n * 0.5f - 0.5f;
    float row = -y / scale + n * 0.5f - 0.5f;
    int c0 = (int)floorf(col), r0 = (int)floorf(row);
    if (c0 < 0 || r0 < 0 || c0 + 1 >= n || r0 + 1 >= n) { *ok = false; return 0.f; }
    float fc = col - c0, fr = row - r0;
    const short* p = dn + (size_t)r0 * n + c0;
    float h00 = __ldg(p), h01 = __ldg(p + 1), h10 = __ldg(p + n), h11 = __ldg(p + n + 1);
    float top = h00 + (h01 - h00) * fc;
    float bot = h10 + (h11 - h10) * fc;
    *ok = true;
    return 0.5f * (top + (bot - top) * fr);
}

// one thread per (cell, azimuth bin)
extern "C" __global__ void horizon(const short* __restrict__ dn, int n, float scale,
                                   const float* __restrict__ frame,   // per cell: up, east, north (9)
                                   const float* __restrict__ h0,      // per cell site height (m)
                                   int ncell, int naz, float obs_h, float max_dist,
                                   float* __restrict__ prof) {
    long long gid = (long long)blockIdx.x * blockDim.x + threadIdx.x;
    if (gid >= (long long)ncell * naz) return;
    int c = (int)(gid / naz), k = (int)(gid % naz);
    const float* f = frame + 9 * c;
    float ux = f[0], uy = f[1], uz = f[2];
    float az = 2.0f * 3.14159265358979f * (k + 0.5f) / naz;
    float ca = cosf(az), sa = sinf(az);
    float dx = ca * f[6] + sa * f[3], dy = ca * f[7] + sa * f[4], dz = ca * f[8] + sa * f[5];
    float base = h0[c] + obs_h;           // observer height above the sphere (m)
    float best = -1.0f;                   // sin of the max elevation
    float dist = scale * 0.5f;
    const float R = (float)R_M;
    while (dist < max_dist) {
        float th = dist / R;
        float st, ct; sincosf(th, &st, &ct);
        float qx = ct * ux + st * dx, qy = ct * uy + st * dy, qz = ct * uz + st * dz;
        float inv = 2.0f * R / (1.0f - qz);
        bool ok;
        float h = height_xy(dn, n, scale, qy * inv, qx * inv, &ok);
        if (!ok) break;                   // left the DEM
        float sh = sinf(0.5f * th);
        float vert = -2.0f * R * sh * sh + h * ct - base;
        float hor = (R + h) * st;
        float s = vert * rsqrtf(vert * vert + hor * hor);
        best = fmaxf(best, s);
        dist += fmaxf(scale * 0.5f, fminf(dist * 0.0025f, 4.0f * scale));
    }
    prof[gid] = asinf(fminf(1.0f, best)) * 57.29577951308232f;
}

__device__ __forceinline__ double hor_at(const float* p, int naz, double az) {
    double fpos = az / 360.0 * naz - 0.5;
    int i0 = (int)floor(fpos);
    double t = fpos - i0;
    int a = ((i0 % naz) + naz) % naz, b = (((i0 + 1) % naz) + naz) % naz;
    return p[a] + ((double)p[b] - p[a]) * t;
}
__device__ __forceinline__ double wrap360(double a) { a = fmod(a, 360.0); return a < 0 ? a + 360.0 : a; }
__device__ __forceinline__ double disk_frac(double u) {
    if (u >= 1.0) return 1.0;
    if (u <= -1.0) return 0.0;
    return 1.0 - (acos(u) - u * sqrt(1.0 - u * u)) / PI_D;
}

// one thread per cell, sequential over hours (longest run needs order)
extern "C" __global__ void metrics(const float* __restrict__ prof, int naz,
                                   const double* __restrict__ frame,  // up, east, north (9) float64
                                   const double* __restrict__ rsite,  // site radius (m) incl. obs height
                                   int ncell, int m,
                                   const double* __restrict__ sun_dir, const double* __restrict__ sun_au,
                                   const double* __restrict__ earth_km, double margin,
                                   double* __restrict__ out) {
    int c = blockIdx.x * blockDim.x + threadIdx.x;
    if (c >= ncell) return;
    const double* f = frame + 9 * c;
    const float* p = prof + (size_t)c * naz;
    double ux = f[0], uy = f[1], uz = f[2], ex = f[3], ey = f[4], ez = f[5], nx = f[6], ny = f[7], nz = f[8];
    double pk = rsite[c] / 1000.0;
    double px = ux * pk, py = uy * pk, pz = uz * pk;
    double sun_sum = 0.0;
    int earth_n = 0, run = 0, best = 0;
    for (int i = 0; i < m; i++) {
        double sx = sun_dir[3 * i], sy = sun_dir[3 * i + 1], sz = sun_dir[3 * i + 2];
        double el = asin(fmin(1.0, fmax(-1.0, sx * ux + sy * uy + sz * uz))) * (180.0 / PI_D);
        double az = wrap360(atan2(sx * ex + sy * ey + sz * ez, sx * nx + sy * ny + sz * nz) * (180.0 / PI_D));
        double r_sun = asin(SUN_R_KM / (sun_au[i] * AU_KM)) * (180.0 / PI_D);
        double fr = disk_frac((el - hor_at(p, naz, az)) / r_sun);
        sun_sum += fr;
        if (fr == 0.0) { run++; if (run > best) best = run; } else run = 0;
        double vx = earth_km[3 * i] - px, vy = earth_km[3 * i + 1] - py, vz = earth_km[3 * i + 2] - pz;
        double nn = sqrt(vx * vx + vy * vy + vz * vz);
        double eel = asin(fmin(1.0, fmax(-1.0, (vx * ux + vy * uy + vz * uz) / nn))) * (180.0 / PI_D);
        double eaz = wrap360(atan2(vx * ex + vy * ey + vz * ez, vx * nx + vy * ny + vz * nz) * (180.0 / PI_D));
        if (eel - hor_at(p, naz, eaz) > margin) earth_n++;
    }
    out[3 * c] = sun_sum / m;
    out[3 * c + 1] = (double)earth_n / m;
    out[3 * c + 2] = (double)best;
}
""".replace("@R@", repr(float(MOON_R_M))).replace("@SUNR@", repr(float(SUN_R_KM)))

_mod = cp.RawModule(code=SRC)  # no --use_fast_math: keep IEEE trig and division
K_HOR = _mod.get_function("horizon")
K_MET = _mod.get_function("metrics")


def frames(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """(N, 9) float64: up, east, north (same convention as horizon.local_frame)."""
    la, lo = np.radians(lat), np.radians(lon)
    up = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], 1)
    east = np.stack([-up[:, 1], up[:, 0], np.zeros_like(la)], 1)  # z x up
    east /= np.linalg.norm(east, axis=1, keepdims=True)
    north = np.cross(up, east)
    return np.concatenate([up, east, north], 1)


def site_heights(dn: np.ndarray, n: int, scale: float, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Vectorised lola.sample_bilinear (NaN outside the grid)."""
    col = x / scale + n / 2.0 - 0.5
    row = -y / scale + n / 2.0 - 0.5
    c0, r0 = np.floor(col).astype(np.int64), np.floor(row).astype(np.int64)
    ok = (c0 >= 0) & (r0 >= 0) & (c0 + 1 < n) & (r0 + 1 < n)
    out = np.full(x.shape, np.nan)
    c0, r0, fc, fr = c0[ok], r0[ok], col[ok] - c0[ok], row[ok] - r0[ok]
    h00, h01 = dn[r0, c0].astype(float), dn[r0, c0 + 1].astype(float)
    h10, h11 = dn[r0 + 1, c0].astype(float), dn[r0 + 1, c0 + 1].astype(float)
    top = h00 + (h01 - h00) * fc
    bot = h10 + (h11 - h10) * fc
    out[ok] = 0.5 * (top + (bot - top) * fr)
    return out


class Gpu:
    def __init__(self, dem: str = "ldem_80s_80m", n_az: int = N_AZ_MAP, max_dist: float = MAX_DIST) -> None:
        """Map method by default; dem="ldem_80s_40m", n_az=1440, max_dist=200 km is the site method."""
        sun_dir, sun_au, earth, self.meta, self.n_hours = load_year()
        self.n_az, self.max_dist = n_az, max_dist
        self.dem = open_dem(dem)
        self.dn_host = np.ascontiguousarray(self.dem.dn)
        self.dn = cp.asarray(self.dn_host)
        self.sun_dir, self.sun_au, self.earth = (cp.asarray(np.ascontiguousarray(a)) for a in (sun_dir, sun_au, earth))

    def compute(self, lat: np.ndarray, lon: np.ndarray, batch: int = 1024, progress: bool = False,
                return_prof: bool = False, obs_h: float = OBS_H):
        """(N, 3) [sun fraction, earth fraction, longest night in hours]; -1 in col 0 = outside the DEM."""
        x = 2.0 * MOON_R_M * np.tan(np.radians(90.0 + lat) / 2) * np.sin(np.radians(lon))
        y = 2.0 * MOON_R_M * np.tan(np.radians(90.0 + lat) / 2) * np.cos(np.radians(lon))
        h0 = site_heights(self.dn_host, self.dem.n, self.dem.scale, x, y)
        valid = np.isfinite(h0)
        idx = np.nonzero(valid)[0]
        out = np.full((lat.size, 3), -1.0)
        profs = np.full((lat.size, self.n_az), np.nan, np.float32) if return_prof else None
        fr = frames(lat, lon)
        t0 = time.perf_counter()
        for b in range(0, idx.size, batch):
            sel = idx[b:b + batch]
            nc = sel.size
            f64 = cp.asarray(np.ascontiguousarray(fr[sel]))
            f32 = f64.astype(cp.float32)
            hh = cp.asarray(h0[sel].astype(np.float32))
            prof = cp.empty(nc * self.n_az, cp.float32)
            nthr = nc * self.n_az
            K_HOR(((nthr + 255) // 256,), (256,),
                  (self.dn, np.int32(self.dem.n), np.float32(self.dem.scale), f32, hh, np.int32(nc),
                   np.int32(self.n_az), np.float32(obs_h), np.float32(self.max_dist), prof))
            rs = cp.asarray(MOON_R_M + h0[sel] + obs_h)
            res = cp.empty(nc * 3, cp.float64)
            K_MET(((nc + 127) // 128,), (128,),
                  (prof, np.int32(self.n_az), f64, rs, np.int32(nc), np.int32(self.n_hours),
                   self.sun_dir, self.sun_au, self.earth, np.float64(EARTH_MARGIN), res))
            out[sel] = res.get().reshape(nc, 3)
            if return_prof:
                profs[sel] = prof.get().reshape(nc, self.n_az)
            if progress:
                done = min(b + batch, idx.size)
                el = time.perf_counter() - t0
                print(f"  {done}/{idx.size} cells ({100 * done / idx.size:.0f} %), {el:.0f} s, "
                      f"ETA {el / done * (idx.size - done):.0f} s", flush=True)
        return (out, profs) if return_prof else out


def run(cell_km: float) -> None:
    g = Gpu()
    n_cells = int(round(2 * HALF_KM / cell_km))
    c = (np.arange(n_cells) + 0.5) * cell_km - HALF_KM
    xx, yy = np.meshgrid(c * 1000.0, -c * 1000.0)  # row 0 = top (+y, towards lon 0)
    lat, lon = xy_to_latlon(xx.ravel(), yy.ravel())
    t = time.perf_counter()
    out = g.compute(np.asarray(lat), np.asarray(lon), progress=True)
    print(f"{lat.size} cells in {time.perf_counter() - t:.0f} s (GPU)", flush=True)

    valid = out[:, 0] >= 0
    planes = np.full((3, lat.size), 255, dtype=np.uint8)
    planes[0, valid] = np.clip(np.round(out[valid, 0] * 200), 0, 200)
    planes[1, valid] = np.clip(np.round(out[valid, 1] * 200), 0, 200)
    # night: days, 253 = 253 days or more, 254 = no sunlight in the whole period
    days = np.clip(np.round(out[valid, 2] * g.meta["step_s"] / 86400.0), 0, 253)
    planes[2, valid] = np.where(out[valid, 2] >= g.n_hours, 254, days)
    (OUT / "heatmap.bin").write_bytes(planes.tobytes())
    (OUT / "heatmap.json").write_text(json.dumps({
        "cell_km": cell_km, "n": n_cells, "half_km": HALF_KM,
        "layout": "3 planes [sun, earth, night], row-major, row 0 at +y (towards lon 0), col 0 at -x",
        "sun_earth_scale": "value / 200 = fraction (0.5 % steps); 255 = no data",
        "night_unit": "days; 253 = 253 days or more; 254 = no sunlight in the whole period; 255 = no data",
        "observer_height_m": OBS_H, "earth_margin_deg": EARTH_MARGIN,
        "period_utc": [g.meta["start_utc"], f"+{g.n_hours} h"],
        "method": "LOLA LDEM_80S_80M, 720 azimuth bins, rays up to 150 km, hourly SPICE ephemeris (GPU)",
    }, indent=1))


def validate(n_points: int) -> None:
    """GPU vs the CPU reference (heatmap._grid / horizon_profile) at random cells."""
    from heatmap import _grid
    from horizon import horizon_profile
    g = Gpu()
    rng = np.random.default_rng(11)
    xy = rng.uniform(-HALF_KM, HALF_KM, (n_points, 2)) * 1000
    lat, lon = xy_to_latlon(xy[:, 0], xy[:, 1])
    lat, lon = np.ascontiguousarray(lat), np.ascontiguousarray(lon)
    t = time.perf_counter()
    gpu, gprof = g.compute(lat, lon, return_prof=True)
    tg = time.perf_counter() - t
    sd, sa, ea, _, _ = load_year()
    cpu = np.zeros((n_points, 3))
    t = time.perf_counter()
    _grid(g.dem.dn, g.dem.n, g.dem.scale, lat, lon, sd, sa, ea, cpu)
    tc = time.perf_counter() - t
    ok = (cpu[:, 0] >= 0) & (gpu[:, 0] >= 0)
    assert np.array_equal(cpu[:, 0] >= 0, gpu[:, 0] >= 0), "DEM coverage differs"
    pd = []
    for k in np.nonzero(ok)[0][:60]:
        p, _ = horizon_profile(g.dem.dn, g.dem.n, g.dem.scale, lat[k], lon[k], OBS_H, MAX_DIST, N_AZ_MAP)
        pd.append(np.abs(p - gprof[k]).max())
    d = (gpu[ok] - cpu[ok])
    print(f"cells {ok.sum()} (GPU {tg:.1f} s, CPU {tc:.1f} s)")
    print(f"horizon: max |diff| over 720 bins, {len(pd)} cells: median {np.median(pd):.4f} deg, "
          f"max {np.max(pd):.4f} deg")
    for i, k in enumerate(("sun", "earth")):
        x = d[:, i] * 100
        print(f"{k}: bias {x.mean():+.4f} pp, MAE {np.abs(x).mean():.4f} pp, max {np.abs(x).max():.4f} pp")
    x = d[:, 2]
    print(f"night: hours differ in {np.count_nonzero(x)} cells, max |diff| {np.abs(x).max():.0f} h")
    # what the browser actually sees: the quantised planes
    q = lambda v: np.clip(np.round(v * 200), 0, 200)  # noqa: E731
    for i, k in enumerate(("sun", "earth")):
        print(f"{k}: quantised (0.5 % step) differs in {np.count_nonzero(q(gpu[ok, i]) != q(cpu[ok, i]))} cells")


if __name__ == "__main__":
    if "--validate" in sys.argv:
        validate(int(sys.argv[sys.argv.index("--validate") + 1]))
    else:
        run(float(sys.argv[sys.argv.index("--cell-km") + 1]) if "--cell-km" in sys.argv else 1.0)
