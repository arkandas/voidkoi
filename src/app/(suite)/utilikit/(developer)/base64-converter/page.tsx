'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Base64Error, decodeFromBase64, encodeFileToBase64, encodeToBase64 } from '@/modules/utilikit/lib/base64-utils';
import { Alert, Button, Card, CardTitle } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

interface OutputProps {
  label: string;
  value: string;
  filename: string;
  mono?: boolean;
  rows?: number;
}

function Output({ label, value, filename, mono = false, rows = 6 }: OutputProps) {
  const tc = useTranslations('utilikit.common');
  const id = useId();

  return (
    <div>
      <Label htmlFor={id} className="break-all">
        {label}
      </Label>
      <Textarea id={id} value={value} readOnly rows={rows} className={mono ? 'font-mono' : undefined} />
      <div className="mt-2 flex flex-wrap gap-2">
        <CopyButton value={value} label={tc('copy')} size="md" className="flex-1" />
        <Button onClick={() => saveAs(new Blob([value], { type: 'text/plain;charset=utf-8' }), filename)} variant="outline" className="flex-1">
          <Download size={16} />
          {tc('download')}
        </Button>
      </div>
    </div>
  );
}

export default function Base64Converter() {
  const t = useTranslations('utilikit.base64Converter');
  const tc = useTranslations('utilikit.common');

  const [textInput, setTextInput] = useState('');
  const [encodedResult, setEncodedResult] = useState('');
  const [base64Input, setBase64Input] = useState('');
  const [decodedResult, setDecodedResult] = useState('');
  const [decodeError, setDecodeError] = useState<Base64Error | null>(null);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [fileError, setFileError] = useState(false);

  const handleDecode = () => {
    const result = decodeFromBase64(base64Input);
    setDecodedResult(result.ok ? result.text : '');
    setDecodeError(result.ok ? null : result.error);
  };

  const handleFile = async ([selected]: File[]) => {
    setFile(null);
    setFileError(false);

    try {
      setFile({ name: selected.name, base64: await encodeFileToBase64(selected) });
    } catch {
      setFileError(true);
    }
  };

  return (
    <ToolLayout>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">{t('encodeTitle')}</CardTitle>
          <div className="space-y-4">
            <Textarea
              label={t('inputText')}
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder={t('enterText')}
              rows={6}
              spellCheck={false}
            />
            <Button onClick={() => setEncodedResult(encodeToBase64(textInput))} className="w-full" disabled={!textInput}>
              {t('encode')}
            </Button>
            {encodedResult && <Output label={t('encodedOutput')} value={encodedResult} filename="encoded.txt" mono />}
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-4">{t('decodeTitle')}</CardTitle>
          <div className="space-y-4">
            <Textarea
              label="Base64"
              value={base64Input}
              onChange={e => setBase64Input(e.target.value)}
              placeholder={t('enterBase64')}
              rows={6}
              spellCheck={false}
              error={decodeError ? t(`errors.${decodeError}`) : undefined}
              className="font-mono"
            />
            <Button onClick={handleDecode} className="w-full" disabled={!base64Input.trim()}>
              {t('decode')}
            </Button>
            {decodedResult && <Output label={t('outputText')} value={decodedResult} filename="decoded.txt" />}
          </div>
        </Card>
      </div>

      <Card className="mt-4 sm:mt-6">
        <CardTitle className="mb-4">{t('encodeFile')}</CardTitle>
        <div className="space-y-4">
          <Dropzone onFiles={handleFile} title={tc('dropFileHere')} hint={t('fileHint')} />
          {fileError && <Alert>{t('readFailed')}</Alert>}
          {file && (
            <Output
              label={`Base64 (${file.name})`}
              value={file.base64}
              filename={`${file.name}.base64.txt`}
              mono
              rows={8}
            />
          )}
        </div>
      </Card>

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-2">{t('about.title')}</CardTitle>
        <p className="text-sm text-ink-muted">{t('about.description')}</p>
      </GuideCard>
    </ToolLayout>
  );
}
