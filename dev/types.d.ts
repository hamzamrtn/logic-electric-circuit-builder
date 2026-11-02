import type { DocumentSession } from '../src/core/session/DocumentSession';
import type { examples } from '../src/components/definitions/examples';
import type { exportSVG, exportPNG } from '../src/io/export';
import type { setDevelopmentTheme } from './host-theme';
declare global { interface Window { __lec: { session: DocumentSession; examples: typeof examples; exportSVG: typeof exportSVG; exportPNG: typeof exportPNG; setDevelopmentTheme: typeof setDevelopmentTheme; }; } }
