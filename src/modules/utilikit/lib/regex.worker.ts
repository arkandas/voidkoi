import { testRegex } from './regex-tester';

interface RegexRequest {
  id: number;
  pattern: string;
  flags: string;
  text: string;
  replacement?: string;
}

self.onmessage = (event: MessageEvent<RegexRequest>) => {
  const { id, pattern, flags, text, replacement } = event.data;
  self.postMessage({ id, result: testRegex(pattern, flags, text, replacement) });
};
