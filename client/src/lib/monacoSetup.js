/**
 * Monaco setup for Vite.
 *
 * 1. Monaco runs language services in Web Workers; Vite's `?worker` import
 *    bundles them and we hand them to Monaco via MonacoEnvironment.
 * 2. loader.config({ monaco }) makes <Editor/> use this local copy, so
 *    y-monaco (which imports 'monaco-editor') and the editor share one instance.
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });
