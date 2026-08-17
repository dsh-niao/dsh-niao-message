# Third-party notices

## terminal-notifier (vendored)

`lib/vendor/terminal-notifier.app` is a copy of the macOS **terminal-notifier** command-line
tool (v2.0.0, arm64), installed via Homebrew, vendored so that the plugin works out of the box
on Apple Silicon without requiring the user to install anything.

- Homepage: <https://github.com/julienXX/terminal-notifier>
- License: MIT

```
All the works are available under the MIT license. Except for 'Terminal.icns', which is a copy
of Apple's Terminal.app icon and as such is copyright of Apple.

Copyright (C) 2012-2016 Eloy Durán eloy.de.enige@gmail.com, Julien Blanchard julien@sideburns.eu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## node-notifier (npm dependency)

[node-notifier](https://github.com/mikaelbr/node-notifier) (MIT) is a runtime dependency that
bundles its own terminal-notifier binary (x86_64), used as the fallback for Intel Macs.

```
MIT License

Copyright (c) 2017 Mikael Brevik

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## esbuild (build-time only, not shipped)

[esbuild](https://github.com/evanw/esbuild) (MIT) is used at build time to bundle the browser
client (`src/client.js` → `lib/client.js`). It is a devDependency and is not included in the
published package.
