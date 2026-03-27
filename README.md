# horsestudiowebgl

Preset-driven WebGL shader toolkit from Horse Studio.

## Install

```bash
npm i horsestudiowebgl
```

## Quick Start

```js
import {
  createDefaultControls,
  createShaderPreset,
  listShaderPresets,
} from 'horsestudiowebgl'

const presets = listShaderPresets()
const preset = createShaderPreset('miracle-led-ripples')
const controls = createDefaultControls('miracle-led-ripples')
```

## Export Current Live Controls

When using the Horse Studio UI, the NPM Export panel outputs a snippet that includes:

1. The selected preset id.
2. The currently visible live control values.
3. A merged `defaultControls` object ready to paste.

Example:

```js
import { createShaderPreset } from 'horsestudiowebgl'

const liveControls = {
  speed: 1.1,
  curves: 0.58,
  colorA: '#7dd3fc',
}

const basePreset = createShaderPreset('miracle-led-ripples')
const shader = {
  ...basePreset,
  defaultControls: {
    ...basePreset.defaultControls,
    ...liveControls,
  },
}
```

## API

- `listShaderPresets()`
  - Returns lightweight metadata list: `{ id, name, mode }[]`
- `getShaderPreset(shaderId)`
  - Returns full preset metadata or `null`
- `createDefaultControls(shaderId)`
  - Returns merged default controls for a preset
- `createShaderPreset(shaderId)`
  - Returns preset object with:
  - `id`, `name`, `mode`, `fragmentShader`, `defaultControls`, `families`, `components`, `summary`

## Local Package Checks

```bash
npm run check:package
```

## Publish

```bash
npm publish
```
