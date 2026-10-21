import {
  type GeneratorWorkerScope,
  installGenerateWorldWorker,
} from './generate-worker-runtime.ts';

installGenerateWorldWorker(self as unknown as GeneratorWorkerScope);
