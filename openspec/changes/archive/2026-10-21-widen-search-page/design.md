# Design

- `pageClass`: `3xl:max-w-(--page-max-wide)`. Сетка `xl:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1fr)]` на `3xl` перераспределить так, чтобы список получал больше места, чем карта (например, `3xl:grid-cols-[15rem_minmax(0,1.6fr)_minmax(0,1fr)]`), и карточка в двух колонках была ≥ 300 px.
- Шапка и подвал остаются по `--page-max`.
