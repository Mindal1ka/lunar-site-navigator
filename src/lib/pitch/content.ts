// AI-assisted: written with Claude, reviewed by the team.
// Pitch deck texts (English is the default; Ukrainian is a full translation).
// Every number here comes from static/data/validation.json, the site card or the README.

export type PitchLang = 'en' | 'uk';

export const PITCH = {
	en: {
		ui: {
			title: 'Lunar Landing Site Navigator: pitch',
			back: 'Open the app',
			export: 'Export',
			pdf: 'PDF',
			pptx: 'PowerPoint',
			fullscreen: 'Full screen (F)',
			prev: 'Previous slide',
			next: 'Next slide',
			hint: '← → to navigate · F full screen',
			langName: { en: 'English', uk: 'Українська' },
			addLink: 'Add a first slide with a link to the live version'
		},
		s0: {
			kicker: 'Live version',
			title: 'This deck is best seen online',
			text: 'The original presentation, with animations and in two languages:',
			sub: 'Open it on any device: scan the code or type the address.'
		},
		s1: {
			kicker: 'NASA Space Apps Challenge 2026 · Lunar south pole',
			title: ['Lunar Landing', 'Site Navigator'],
			lead: [
				'Where and when to land at the lunar south pole: ',
				'sunlight',
				', ',
				'Earth in view',
				' and the ',
				'longest night',
				', computed from real NASA terrain and ephemerides.'
			],
			cap: 'Rendered by the app: NASA LOLA terrain around Shackleton crater; Earth placed from JPL ephemerides.'
		},
		s2: {
			kicker: 'The problem',
			title: 'At the pole the Sun skims the horizon. A few hundred metres change everything.',
			q: [
				['Power', 'How much of the time is the solar panel in sunlight?'],
				['Survival', 'How long is the longest night the battery must survive?'],
				['Contact', 'How often can the antenna see Earth directly?']
			],
			callout: ['Within 500 m of Connecting Ridge, sunlight ranges from ', ' to ', ' and the longest night from ', ' to ', ' days.'],
			caption: '360° view from Connecting Ridge (C1): the Sun is 1.4° above the real LOLA horizon.',
			case: ['Real case: ', 'IM-2 Athena', ' (March 2025) came down on its side in a crater about 250 m from its target. Its solar panels could not catch the low Sun, and the battery ran out about 12 hours later.']
		},
		s3: {
			kicker: 'What we built',
			title: 'One app answers all three, for any point and dates.',
			f: [
				['Real 3D terrain', 'NASA LOLA heights with live shadows for any moment.'],
				['Three clear numbers', 'Sunlight %, Earth in view %, longest night, each labelled with period and panel height.'],
				['Compare A vs B', 'Side by side, with the difference.'],
				['Any point, any dates', 'Click the terrain; pick a month, a year or custom dates.'],
				['Simple · Teacher · Planner', 'In English and Ukrainian.']
			]
		},
		s4: {
			kicker: 'How it works',
			title: 'Real horizon × real Sun and Earth positions, every hour.',
			steps: [
				['01 · NASA LOLA', 'Terrain', 'Lunar Orbiter Laser Altimeter heights, 40 m and 80 m grids.'],
				['02 · Horizon', 'Horizon in 1440 directions', 'Rays up to 200 km, Moon curvature included.'],
				['03 · NAIF SPICE', 'Sun and Earth, hourly', 'Positions from JPL ephemerides.'],
				['04 · Result', 'Per hour, then per period', 'Visible share of the solar disk; Earth above the horizon + antenna margin.']
			],
			stat1: 'points: the 100 m map of the whole 420 × 420 km region; over an hour on two GPUs',
			stat2: 'for the 1 km overview map (176 thousand points) on one GPU',
			min: 'min'
		},
		s5: {
			kicker: 'Is it correct?',
			title: 'Checked against NASA data and published research.',
			r1: ['max difference from ', 'JPL Horizons', ' (3 sites × 293 dates)'],
			r2: ['mean error vs the ', 'NASA LOLA', ' illumination map, 150 points (r = 0.97)'],
			note: 'Always compared at the same height and with the same definition as the reference. At 0 m our values are 8–28 pp below the published ones: on sharp ridges, terrain finer than a pixel decides. So the app uses a 2 m panel height by default.',
			pp: 'pp',
			tTitle: 'Gläser et al. (2018), Sun %',
			tSub: 'Same 2 m height, same definition (mean visible share of the disk)',
			th: ['Site', 'Published', 'Ours', 'Diff'],
			rows: ['Connecting Ridge C1', 'Connecting Ridge C2', 'Shackleton rim S1', 'Shackleton rim S2', 'EPSC 2014 spot 3, 10 m']
		},
		s6: {
			kicker: 'For mission planners',
			title: 'From numbers to a landing plan.',
			f: [
				['Best spot nearby', 'Most sunlight within 5 km under a lander slope limit (5⁠–⁠20°).'],
				['Best window & battery', 'Battery = load × longest night ÷ 80 % allowed discharge.'],
				['Charts & export', 'Sun and Earth elevation over the real horizon; CSV export.'],
				['Works everywhere', 'Even on a PC without a graphics card; shareable links.']
			]
		},
		s7: {
			kicker: 'Open and honest',
			title: 'Built on open NASA data. Open source.',
			data: 'Data',
			code: 'Code',
			dataList: [
				['NASA LOLA', ' terrain (PDS): LDEM 40 m / 80 m'],
				['NASA LOLA', ' illumination maps (validation)'],
				['NAIF SPICE', ' kernels, JPL Horizons'],
				['', 'Gläser et al., 2014 / 2018 (validation)']
			],
			codeList: [
				['', 'SvelteKit, three.js, uPlot'],
				['', 'Python, NumPy, CuPy (GPU)'],
				['License: ', 'Apache-2.0']
			],
			try: 'Try it now, on any device',
			ai: 'Use of AI: the idea and every product decision are the team’s. Code was written with an AI assistant (Claude) and reviewed by the team; this is noted in the README and in the code. No AI-generated images are used: all pictures are screenshots of the app.'
		}
	},
	uk: {
		ui: {
			title: 'Lunar Landing Site Navigator: презентація',
			back: 'Відкрити застосунок',
			export: 'Експорт',
			pdf: 'PDF',
			pptx: 'PowerPoint',
			fullscreen: 'Повний екран (F)',
			prev: 'Попередній слайд',
			next: 'Наступний слайд',
			hint: '← → гортати · F повний екран',
			langName: { en: 'English', uk: 'Українська' },
			addLink: 'Додати перший слайд із посиланням на онлайн-версію'
		},
		s0: {
			kicker: 'Онлайн-версія',
			title: 'Цю презентацію краще дивитися онлайн',
			text: 'Оригінал з анімаціями та двома мовами:',
			sub: 'Відкрийте на будь-якому пристрої: відскануйте код або введіть адресу.'
		},
		s1: {
			kicker: 'NASA Space Apps Challenge 2026 · Південний полюс Місяця',
			title: ['Lunar Landing', 'Site Navigator'],
			lead: [
				'Де й коли сідати на південному полюсі Місяця: ',
				'сонце',
				', ',
				'видимість Землі',
				' і ',
				'найдовша ніч',
				', пораховані за справжнім рельєфом і ефемеридами NASA.'
			],
			cap: 'Кадр із застосунку: рельєф NASA LOLA біля кратера Шеклтона; положення Землі — з ефемерид JPL.'
		},
		s2: {
			kicker: 'Проблема',
			title: 'На полюсі Сонце ковзає над горизонтом. Кілька сотень метрів змінюють усе.',
			q: [
				['Енергія', 'Яку частку часу сонячна панель на сонці?'],
				['Виживання', 'Скільки триває найдовша ніч, яку має пережити батарея?'],
				['Звʼязок', 'Як часто антена бачить Землю напряму?']
			],
			callout: ['У межах 500 м від Connecting Ridge сонце — від ', ' до ', ', а найдовша ніч — від ', ' до ', ' діб.'],
			caption: 'Панорама 360° з Connecting Ridge (C1): Сонце на 1,4° над справжнім горизонтом LOLA.',
			case: ['Реальний випадок: ', 'IM-2 Athena', ' (березень 2025) сів на бік у кратері приблизно за 250 м від цілі. Сонячні панелі не ловили низьке Сонце, і батарея сіла приблизно через 12 годин.']
		},
		s3: {
			kicker: 'Що ми зробили',
			title: 'Один застосунок відповідає на всі три питання.',
			f: [
				['Справжній 3D-рельєф', 'Висоти NASA LOLA з тінями на будь-який момент.'],
				['Три зрозумілі числа', 'Сонце %, Земля у видимості %, найдовша ніч — з підписом періоду й висоти панелі.'],
				['Порівняння A і B', 'Поруч, з різницею.'],
				['Будь-яка точка, будь-які дати', 'Клік по рельєфу; місяць, рік або свої дати.'],
				['Простий · Учитель · Планувальник', 'Англійською та українською.']
			]
		},
		s4: {
			kicker: 'Як це працює',
			title: 'Справжній горизонт × справжні положення Сонця й Землі, щогодини.',
			steps: [
				['01 · NASA LOLA', 'Рельєф', 'Висоти лазерного альтиметра LOLA, сітки 40 м і 80 м.'],
				['02 · Горизонт', 'Горизонт у 1440 напрямках', 'Промені до 200 км з урахуванням кривизни Місяця.'],
				['03 · NAIF SPICE', 'Сонце й Земля щогодини', 'Положення з ефемерид JPL.'],
				['04 · Результат', 'Щогодини, потім за період', 'Видима частка сонячного диска; Земля над горизонтом + запас антени.']
			],
			stat1: 'точок: карта 100 м усього регіону 420 × 420 км; понад годину на двох відеокартах',
			stat2: 'на оглядову карту 1 км (176 тисяч точок) на одній відеокарті',
			min: 'хв'
		},
		s5: {
			kicker: 'Чи це правильно?',
			title: 'Перевірено за даними NASA й опублікованими дослідженнями.',
			r1: ['найбільша різниця з ', 'JPL Horizons', ' (3 місця × 293 дати)'],
			r2: ['середня похибка відносно карти освітленості ', 'NASA LOLA', ', 150 точок (r = 0,97)'],
			note: 'Порівнюємо завжди на тій самій висоті й за тим самим визначенням, що й еталон. На 0 м розбіжність із публікацією 8–28 в. п.: на гострих гребенях вирішує рельєф, дрібніший за піксель. Тому за замовчуванням висота панелі 2 м.',
			pp: 'в. п.',
			tTitle: 'Gläser et al. (2018), Сонце %',
			tSub: 'Та сама висота 2 м, те саме визначення (середня видима частка диска)',
			th: ['Місце', 'Опубліковано', 'Наше', 'Різниця'],
			rows: ['Connecting Ridge C1', 'Connecting Ridge C2', 'Вал Шеклтона S1', 'Вал Шеклтона S2', 'EPSC 2014, точка 3, 10 м']
		},
		s6: {
			kicker: 'Для планувальників місій',
			title: 'Від чисел до плану посадки.',
			f: [
				['Найкраще місце поруч', 'Найбільше сонця в радіусі 5 км з обмеженням нахилу посадкового модуля (5⁠–⁠20°).'],
				['Найкраще вікно й батарея', 'Батарея = навантаження × найдовша ніч ÷ 80 % допустимого розряду.'],
				['Графіки й експорт', 'Висота Сонця й Землі над справжнім горизонтом; експорт CSV.'],
				['Працює всюди', 'Навіть на ПК без відеокарти; посилання, якими можна поділитися.']
			]
		},
		s7: {
			kicker: 'Відкрито й чесно',
			title: 'Відкриті дані NASA. Відкритий код.',
			data: 'Дані',
			code: 'Код',
			dataList: [
				['NASA LOLA', ': рельєф (PDS), LDEM 40 м / 80 м'],
				['NASA LOLA', ': карти освітленості (перевірка)'],
				['NAIF SPICE', ', JPL Horizons'],
				['', 'Gläser et al., 2014 / 2018 (перевірка)']
			],
			codeList: [
				['', 'SvelteKit, three.js, uPlot'],
				['', 'Python, NumPy, CuPy (GPU)'],
				['Ліцензія: ', 'Apache-2.0']
			],
			try: 'Спробуйте зараз, на будь-якому пристрої',
			ai: 'Використання ШІ: ідея та всі продуктові рішення — команди. Код написано з ШІ-асистентом (Claude) і перевірено командою; це зазначено в README і в коді. Згенерованих ШІ зображень немає: усі картинки — скриншоти застосунку.'
		}
	}
} as const;
