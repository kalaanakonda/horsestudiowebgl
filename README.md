# @horsestudio/shader-studio

Preset-driven WebGL shader toolkit from Horse Studio.

## Install

```bash
npm i @horsestudio/shader-studio
```

## Usage

```js
import {
  createDefaultControls,
  createShaderPreset,
  listShaderPresets,
} from '@horsestudio/shader-studio'

const presets = listShaderPresets()
const preset = createShaderPreset('ditherfx-object')
const controls = createDefaultControls('ditherfx-object')
```

## API

- `listShaderPresets()`
  - returns lightweight metadata list: `{ id, name, mode }[]`
- `getShaderPreset(shaderId)`
  - returns full preset metadata or `null`
- `createDefaultControls(shaderId)`
  - returns merged default controls for a preset
- `createShaderPreset(shaderId)`
  - returns a release-safe preset object with:
  - `id`, `name`, `mode`, `fragmentShader`, `defaultControls`, `families`, `components`, `summary`

## Local package checks

```bash
npm run check:package
```

## Publish

```bash
npm publish
```

> Package is configured with `publishConfig.access=public` for scoped npm publish.
