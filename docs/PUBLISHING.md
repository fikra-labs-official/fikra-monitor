# Подготовка публикации / Publishing checklist

## Русский

Публикуйте исходный код форка, а не копию личной рабочей папки. Ключи каждый пользователь получает самостоятельно по [инструкции](setup.ru.md).

1. Проверьте владельца и адрес GitHub-репозитория. `upstream` должен указывать на `bilawalsidhu/gods-eye-view`, а `origin` на ваш форк. Не перезаписывайте другой существующий проект.
2. Сохраните MIT-уведомление автора, `DATA_SOURCES.md` и указания по лицензиям моделей/медиа. MIT на код не отменяет условий Google, Cesium и поставщиков данных.
3. Запустите `npm ci`, `npm test`, `npm run build`, `npm audit` и `npm run check:publication`. Используйте Node 24 для тестов лимитов выделения памяти. Не пропускайте их ради зелёного результата.
4. Проверьте `git status --short` и diff. Добавляйте в индекс конкретные исходники и документы. `.env*` (кроме пустого `.env.example`), `pinokio/ENVIRONMENT`, журналы, профили браузера, `dist`, кэши и личные скриншоты не должны входить в коммит.
5. После добавления файлов проверьте именно индекс: `node scripts/check-publication.mjs --staged`. Обнаруженный секрет нельзя просто удалить из текущего файла, если он уже был закоммичен.
6. Отдельно просканируйте **полную** Git-историю. Например, [Gitleaks](https://github.com/gitleaks/gitleaks) поддерживает `gitleaks git --redact=100 --log-opts="--all" .`. Ошибка чтения Git-объектов означает неполную проверку, даже если программа также напечатала «no leaks». Никогда не публикуйте сырые отчёты сканера с ключами.
7. Если ключ обнаружен в опубликованной истории, сначала отзовите его у провайдера. Очистка истории и force-push требуют отдельного согласования с участниками.
8. После публикации проверьте клонирование в новую пустую папку, установку без ключей и GitHub Actions. Секреты владельца форка в CI не нужны. В README должен стоять реально опубликованный адрес.

Для обновления получите теги `upstream`, прочитайте release notes и проверьте объединение в отдельной ветке. Не запускайте автоматический merge/rebase поверх несохранённых пользовательских изменений. Основа текущей подготовки: стабильный `v0.1.1`, а не вся развивающаяся `upstream/main`.

## English

Publish the fork's source, not your private working directory. Every installer supplies their own provider keys using the [setup guide](setup.en.md).

1. Verify the GitHub owner and remote targets. `upstream` is `bilawalsidhu/gods-eye-view`; `origin` is your fork, not an unrelated existing repository.
2. Preserve the original MIT notice and third-party data, model, and media terms. The code license does not override provider terms.
3. Run `npm ci`, `npm test`, `npm run build`, `npm audit`, and `npm run check:publication`. Use Node 24 for allocation gates.
4. Review the diff and stage named source/doc files only. Never stage private dotenv files, `pinokio/ENVIRONMENT`, logs, browser profiles, build output, caches, or personal screenshots.
5. Inspect the actual index with `node scripts/check-publication.mjs --staged`. Then independently scan the full Git history, for example with `gitleaks git --redact=100 --log-opts="--all" .`. A Git object-read failure invalidates the scan.
6. Revoke exposed credentials before discussing history rewriting. Do not publish raw secret-scanner reports or force-push over collaborators without agreement.
7. After publication, verify a fresh keyless clone/install and GitHub Actions. CI does not need the maintainer's provider secrets. Update README with the published URL.

For upstream updates, fetch tags, review release notes, and integrate on a separate branch. The current preparation uses stable `v0.1.1`, not every change on the evolving upstream main branch.
