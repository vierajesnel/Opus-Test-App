import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

// On the web, Skia runs on CanvasKit (WebAssembly), which must finish loading
// before any module that touches Skia is evaluated.
LoadSkiaWeb({ locateFile: (file: string) => `/${file}` })
  .then(async () => {
    const { default: App } = await import('./src/App');
    registerRootComponent(App);
  })
  .catch((e) => console.error('Skia failed to load', e));
