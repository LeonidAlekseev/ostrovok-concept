# Design

## Decisions

**Отмена только для PR:** `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Группа `ci-${{ github.ref }}` остаётся: у PR ref вида `refs/pull/N/merge`, у push — ветка.

**SHA:** брать SHA коммита, на который указывает актуальный тег `v4.*` каждого action (`gh api repos/actions/checkout/git/ref/tags/<tag>`; для аннотированного тега разыменовать до коммита). Рядом — комментарий с тегом.

## Risks / Trade-offs

- [Закреплённые SHA не получают патчи] → Принято; обновление — вручную или через Dependabot, вне scope.
- [Прогоны на push не отменяются и занимают раннер] → Принято: их немного.
