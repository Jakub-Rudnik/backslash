import { useEffect, useRef, useState, type RefObject } from "react";
import {
  GlobalWorkerOptions,
  getDocument,
  RenderingCancelledException,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

type PdfViewerProps = {
  url: string | null;
  className?: string;
};

export function PdfViewer({ url, className }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [loaded, setLoaded] = useState<{
    task: PDFDocumentLoadingTask;
    pdf: PDFDocumentProxy;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const task = getDocument({ url });
    task.promise.then(
      (pdf) => {
        if (cancelled) {
          void task.destroy();
          return;
        }
        setError(null);
        setLoaded({ task, pdf });
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    return () => {
      void loaded?.task.destroy();
    };
  }, [loaded]);

  const pdf = loaded?.pdf;

  return (
    <div ref={containerRef} className={className}>
      {error && <p className="p-4 text-sm text-destructive">{error}</p>}
      {pdf &&
        width > 0 &&
        Array.from({ length: pdf.numPages }, (_, i) => (
          <PdfPage key={i + 1} pdf={pdf} pageNumber={i + 1} width={width} />
        ))}
    </div>
  );
}

type PdfPageProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
};

function PdfPage({ pdf, pageNumber, width }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;

    void pdf.getPage(pageNumber).then((page) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;

      const scale = width / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      task = page.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      task.promise.catch((err: unknown) => {
        if (!(err instanceof RenderingCancelledException)) console.error(err);
      });
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width]);

  return <canvas ref={canvasRef} className="mx-auto mb-4 block shadow-md" />;
}

function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
