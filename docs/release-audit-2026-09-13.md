# Проверка релизной копии / Release preparation audit

Дата: 2026-09-13. Локальная проверка перед отправкой кода в публичный форк [Fikra Monitor](https://github.com/fikra-labs-official/fikra-monitor). Статус последующих запусков CI смотрите в [GitHub Actions](https://github.com/fikra-labs-official/fikra-monitor/actions).

## Основа и границы обновления

- Сохранены русская локализация, оформление Fikra Labs и существующие функции форка.
- Интегрирован стабильный upstream [`v0.1.1`](https://github.com/bilawalsidhu/gods-eye-view/releases/tag/v0.1.1), commit `65bc522f49dc1166eca533996be8e789ad36cfe5`.
- Проверенная `upstream/main`: `b2090a5320691cf7e60edc371415a95356b75227`. Она содержит более крупную нерелизную перестройку; все её изменения в этот кандидат не включены.
- Из стабильного обновления получены запуск без обязательных ключей и настройки провайдеров, исправления обработки больших ответов FIRMS/GBFS и разделения серверного и браузерного кода.
- MIT-уведомление исходного автора и требования атрибуции источников сохранены. Лицензия кода не заменяет условия поставщиков данных.

## Исправления этой проверки

| Область | Изменение |
|---|---|
| Дорожный поток | Частично неуспешная загрузка TomTom больше не выдаётся за полное покрытие. При отказе всех источников удаляются старые дорожные точки и линии, показывается отсутствие данных. |
| Поиск и перелёты | REST-геокодирование перенесено на локальный сервер. Отдельный Google server key доступен в настройках. Координаты с полной точностью не отвергаются валидатором. |
| Границы и аннотации | Отмена запроса действует и на отложенную загрузку контура; устаревшая операция не должна позднее менять карту или камеру. Наличие реального контура по-прежнему зависит от данных источника. |
| OpenAI | Пустая сводка возвращает явную ошибку. Добавлены таймауты, безопасные ответы об ошибках и запрет кэширования временного голосового токена. |
| Голос Live | GPT-Live 1 ведёт разговор, GPT-5.6 Terra получает делегированные команды и рассуждения. Добавлены серверный SDP-брокер, обработка продолжений команд и закрытия сессии, лимиты подключения. Realtime сохранён как явно выбираемый резервный движок. |
| Интерфейс | Исправлены пересечения шапки на узких экранах. Русская подпись велостанции сокращена без потери счётчиков и без ослабления тестовых лимитов памяти. |
| Запуск | Скрипты используют loopback и не завершают неизвестные процессы, занявшие порт. Повторяющиеся небезопасные варианты запуска заменены общим путём. |
| Windows | Проверка прав файла использует собственные модули Windows PowerShell вместо унаследованного пути PowerShell 7. Условия проверки ACL сохранены; CI отдельно проверяет права до запуска установщика Pinokio. |
| Приватные данные | Закрыта раздача приватных файлов через dev/preview; API проверяет локальный адрес, Host и Origin. Голосовые debug-журналы выключены по умолчанию и не сохраняют произвольные payload, расшифровки или ключи. |
| Подготовка GitHub | Добавлены проверка рабочего дерева/индекса, исключения для секретов и артефактов, инструкции RU/EN и CI без ключей владельца. |

Зависимости обновлены вместе с lockfile. Использованы обычные целевые обновления и совместимые исправления `npm audit`, без `--force`.

## Проверено локально

Среда: macOS, тесты под Node.js 24.19.0. Проверки выполнялись из отдельной релизной копии с установленными по lockfile зависимостями, без личного `.env`. После добавления Live повторены полный набор тестов, сборка, doctor и проверки публикации.

| Проверка | Результат |
|---|---|
| Установка | `npm ci` завершился успешно. |
| Локальная конфигурация | `npm run doctor -- --json`: `ready: true`, ключи провайдеров не настроены. |
| Обычные тесты | 2 767 успешных, 0 ошибок, 1 пропуск: проверка Windows DACL требует Windows. Включены 27 новых тестов клиента и сервера Live. |
| Лимиты выделения памяти | Ещё 14 успешных тестов под Node 24, исходные пороги сохранены. Всего 2 781 успешный тест. |
| Сборка | `npm run build` успешна. Есть предупреждения о крупных чанках статических геоданных; они не скрыты повышением порога. |
| Зависимости | `npm audit`: 0 известных уязвимостей на дату проверки. Это не гарантия отсутствия неизвестных проблем. |
| Браузерный smoke | При подготовке базовой релизной копии: 19/19 проверок оболочки, элементов управления и навигации, 0 ошибок страницы. Ширины 320, 390, 584, 585, 620 и 1440 px. Для Live отдельно проверены подключение, команда карты и закрытие на моках в рабочей копии; исходники Live перенесены без изменений. Внешние запросы и API блокировались. |
| HTTP-границы | Тесты dev/preview проверяют отказ чужому Origin, приватным файлам, отсутствие ключей и безопасные ответы провайдеров. |
| Публикация | Проверка кандидатов и индекса, поиск шаблонов секретов и точное сравнение с личными значениями: совпадений не найдено. |
| История Git | Проверена целостность полного клона и полная доступная история. Gitleaks с полным скрытием значений: находок нет. |

## Что это не подтверждает

- Платные API, живой голос/микрофон, текущая доступность камер, трафика, AIS и пожаров в этом прогоне не проверялись. Квоты, биллинг, ограничения ключей и региональное покрытие проверяются отдельно с ключами пользователя.
- Браузерный smoke с заблокированной сетью не подтверждает загрузку фотограмметрии, спутниковых снимков или рельефа.
- Тесты кабины, границ и голосовых действий не равны живой проверке каждого самолёта, региона или произнесённой команды.
- Нагрузка при длительной работе с несколькими живыми слоями, Windows и Linux на реальном устройстве отдельно не измерялись. Локальные результаты в этой таблице не заменяют отдельные результаты GitHub Actions для Linux/Windows.
- Сервер предназначен для локального использования. Это не готовый публичный многопользовательский сервис.
- Релизная копия не содержит личный `.env`. Обновление репозитория и документации не означает перезапуск личного работающего приложения.

Перед публикацией следуйте [чек-листу](PUBLISHING.md). После добавления файлов в индекс повторите проверку `--staged`; при изменении истории повторите её сканирование.

## English summary

This records local checks before pushing to the public [Fikra Monitor fork](https://github.com/fikra-labs-official/fikra-monitor). It preserves Fikra branding and Russian localization while integrating stable upstream `v0.1.1` (`65bc522`). The newer, substantially restructured upstream main was inspected but not fully merged. Check [GitHub Actions](https://github.com/fikra-labs-official/fikra-monitor/actions) for subsequent CI results.

Fixes cover incomplete/stale traffic data, server-side geocoding and coordinate precision, cancellation of deferred boundaries, OpenAI error handling/timeouts, narrow-screen layout, a localized-card allocation regression, safe loopback launchers, private-file protection, and credential/log handling. Original licensing and data attribution remain intact.

The release copy uses lockfile-installed dependencies without the maintainer's dotenv file. After adding GPT-Live 1 speech and GPT-5.6 Terra delegation, the full Node 24.19.0 test suite passed: **2,781 passed, zero failures, one Windows-only skip**, including 27 Live regressions and 14 allocation checks with unchanged limits. Build and setup checks passed; `npm audit` reported zero known vulnerabilities. The earlier keyless, network-blocked browser smoke passed 19/19 checks without page errors. A separate mocked Live connect/map-action/close smoke passed in the working copy before its unchanged Live sources were transferred. Publication candidates, personal-value comparisons, and full Git-history secret scans produced no findings.

These checks do **not** establish live paid-provider availability, microphone behavior, 3D coverage, long-running live-load performance, or Windows/Linux device acceptance. CI results are separate from these local checks. Private credentials were not copied into the release; repository/documentation updates do not restart an existing local installation. See the [publishing checklist](PUBLISHING.md) and [English setup guide](setup.en.md).
