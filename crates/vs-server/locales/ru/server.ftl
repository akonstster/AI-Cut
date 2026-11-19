## service: the port and who holds it
service-bad-port = { $value }: не номер порта (ожидается 1..65535)
service-exe-path = путь к exe сервиса: { $error }
service-request-not-sent = соединение принято, но запрос не ушёл: { $error }
service-no-health-answer = соединение принято, ответа на /health нет: { $error }
service-not-http = ответ не по HTTP
service-health-status = HTTP-сервер, /health ответил { $code }
service-health-not-AI-Cut = HTTP-сервер, /health ответил не телом AI-Cut
service-health-not-json = HTTP-сервер, /health ответил не JSON
service-health-no-fields = /health называет себя { $app }, но без полей сервиса: { $error }
service-other-app = другое приложение ({ $app })
service-health-no-app = HTTP-сервер, /health без имени приложения
service-port-reserved = система не отдаёт порт, хотя соединений на нём никто не принимает (возможно, он в зарезервированном диапазоне Windows: { $command })
service-port-AI-Cut = на нём AI-Cut { $version } ({ $executable })
service-port-other = его занял другой процесс: { $what }
service-port-busy = Порт 127.0.0.1:{ $port } занят уже { $seconds } с: { $who }. Ошибка: { $error }.

    Закройте программу, которая его держит, или задайте другой порт переменной окружения { $env } (например, { $env }={ $other_port }).

## jobs
jobs-variants = { $count ->
    [one] { $count } вариант
    [few] { $count } варианта
   *[many] { $count } вариантов
}
jobs-interrupted-sending = Программа закрылась, пока задача отправлялась; повторно она не отправлена, чтобы не заплатить дважды. Запустите её снова, если результат не пришёл.
jobs-busy = Провайдер сейчас занят: { $reason }. Запустите снова через минуту.
jobs-too-many-files = { $field }: не больше { $max } файлов.
jobs-bad-media = Это не медиа рабочей папки: { $media }
jobs-media-not-in-workspace = Файла медиа { $media } нет в рабочей папке. Импортируйте его с копированием и попробуйте снова.
jobs-no-such-output = Нет такого результата задачи { $job }
jobs-lost-contact = Провайдер перестал отвечать по этой задаче: { $reason }
jobs-too-long = Провайдер работает над задачей больше трёх часов; её больше не ждём.
jobs-download-failed = Результат не скачался: { $reason }
jobs-cancelled = Отменено.
jobs-cancelled-not-waiting = Ожидание остановлено. Этот провайдер не умеет отменять задачи, поэтому она может завершиться и быть оплачена.
jobs-field-required = Заполните: { $field }
jobs-place-needs-project = Чтобы поставить результат на таймлайн, нужен project_id — проект, открытый в окне (его называет editor_state).
jobs-not-found = Нет задачи { $job }
jobs-still-running = Задача ещё идёт; сначала отмените её.

## catalogue and keys
catalog-empty = Провайдер вернул пустой каталог.
catalog-unknown-model = У { $provider } в каталоге нет модели { $model }.
catalog-no-schema = У модели нет описания, из которого строится форма.
catalog-unknown-provider = Неизвестный провайдер: { $provider }
keys-env-wins = Задана переменная окружения { $variable }, она важнее; уберите её, чтобы хранить ключ здесь.
keys-one-line = Ключ — одна строка.
settings-bad-budget = Дневной лимит — число от 0 до 10000.
settings-bad-port = Порт — число от 1024 до 65535.
spend-agent-limit = Агенты потратили сегодня ${ $spent }; эта задача стоит около ${ $cost } и превысит дневной лимит ${ $budget }. Поднимите лимит в Настройках, раздел «Провайдеры».
spend-agent-limit-reached = Агенты исчерпали сегодняшний лимит ${ $budget }.
catalog-partial = Часть каталога не прочиталась: { $failures }. Прочитанные модели в списке; обновите, чтобы попробовать снова.

## the desktop shell
shell-server-failed = Сервер AI-Cut не запустился: { $error }
shell-server-stopped = Сервер AI-Cut остановился сразу после запуска.
shell-server-crashed = Поток сервера AI-Cut упал при запуске.
shell-server-silent = Сервер AI-Cut не ответил на 127.0.0.1:{ $port } за 30 с.
update-title = Обновление AI-Cut
update-install-now = Вышел AI-Cut { $version }. Установить сейчас? Программа перезапустится, когда закончит.
update-open-page = Вышел AI-Cut { $version }. Открыть страницу релиза, чтобы скачать его?
update-button-install = Установить
update-button-open = Открыть страницу
update-button-later = Позже
update-open-failed = Страница релиза не открылась: { $error }. Откройте { $url } в браузере.
update-failed = Обновление не установилось: { $error }

## exports
exports-dialog-title = Сохранить видео
exports-no-folder = Папки файла { $path } нет.
exports-no-file = Файла { $path } нет.
jobs-finished-after-cancel = Провайдер доделал задачу уже после отмены; результат сохранён, раз он оплачен.

quit-title = Закрыть AI-Cut?
quit-running = Не закончено генераций: { $count }. Уже отправленные в fal или Runware подхватятся при следующем запуске; та, что сейчас отправляется, и запрос OpenRouter пропадут, а оплата за них может пройти.
quit-button-quit = Закрыть
quit-button-stay = Остаться
