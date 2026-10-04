import { CloudUpload, FileText } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Click/drag file upload zone shared by the HTML and JSON tabs. */
export function FileDropzone({
  id,
  name,
  label,
  accept,
  placeholder,
  hints,
  hint,
  fileRef,
  fileName,
  setFileName,
  dragging,
  setDragging,
  onFileSelected,
}: {
  id: string;
  name: string;
  label: string;
  accept: string;
  placeholder: string;
  /** Format/limit chips shown inside the zone. */
  hints?: string[];
  hint?: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  fileName: string;
  setFileName: (name: string) => void;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  /** Called with the chosen file. */
  onFileSelected?: (file: File) => void;
}) {
  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    onFileSelected?.(file);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          'group relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border-2 border-dashed px-6 py-10 text-center transition-all',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border/70 bg-muted/25 hover:border-primary/45 hover:bg-primary/5',
        )}
      >
        {/* Dot-grid background. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(color-mix(in oklch, var(--primary) 7%, transparent) 1px, transparent 1px)] [background-size:16px_16px]"
        />
        {/* Hover glow. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(50% 100% at 50% 0%, color-mix(in oklch, var(--primary) 8%, transparent), transparent)',
          }}
        />
        <span className="relative flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-105">
          <CloudUpload className="size-6" aria-hidden />
        </span>
        {fileName ? (
          <span className="relative inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{fileName}</span>
          </span>
        ) : (
          <span className="relative block text-sm font-medium">
            {placeholder}
          </span>
        )}
        {hints && hints.length > 0 ? (
          <span className="relative flex flex-wrap justify-center gap-1.5">
            {hints.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[0.625rem] text-muted-foreground"
              >
                {chip}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      <Input
        id={id}
        name={name}
        type="file"
        accept={accept}
        ref={fileRef}
        onChange={(event) => handleFile(event.target.files?.[0])}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
