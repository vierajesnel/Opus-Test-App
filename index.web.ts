import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

// On the web, Skia runs on CanvasKit (WebAssembly), which must finish loading
// before any module that touches Skia is evaluated. The .wasm file is resolved
// against the page URL so the build works at a domain root or under a
// sub-path (GitHub Pages serves this project at /<repo>/).
LoadSkiaWeb({ locateFile: (file: string) => new URL(file, document.baseURI).href })
  .then(async () => {
    const { default: App } = await import('./src/App');
    registerRootComponent(App);
  })
  .catch((e) => {
    console.error('Skia failed to load', e);
    const boot = document.getElementById('boot-status');
    if (boot) boot.textContent = 'This browser couldn’t start the sky (WebGL/WebAssembly needed).';
  });
