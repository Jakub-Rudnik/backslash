import { Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { useState, type DragEvent, type ReactNode } from "react";
import { FILE_TREE_DROP } from "@/features/files/file-tree";

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

const overTree = (e: DragEvent) =>
  e.target instanceof Element && !!e.target.closest(FILE_TREE_DROP);

/**
 * Takes files dropped anywhere in `children` (the editor and the PDF included), so the browser
 * doesn't open them and the editor doesn't paste their text. Drops on the file tree are left to the
 * tree, which puts them in the folder under the pointer. Viewers can't drop anything.
 */
export function FileDropZone({
  readOnly,
  onDrop,
  className,
  children,
}: {
  readOnly: boolean;
  /** call `upload.drop` synchronously in it */
  onDrop: (dt: DataTransfer) => void;
  className?: string;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);

  /** Runs before the editor's own handlers (capture phase); false leaves the event to the tree. */
  function intercept(e: DragEvent) {
    if (!hasFiles(e) || (!readOnly && overTree(e))) {
      setDragging(false);
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  return (
    <div
      className={cn("relative", className)}
      onDragOverCapture={(e) => {
        if (!intercept(e)) return;
        e.dataTransfer.dropEffect = readOnly ? "none" : "copy";
        setDragging(!readOnly);
      }}
      onDragLeave={(e) => {
        const inside = e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget);
        if (!inside) setDragging(false);
      }}
      onDropCapture={(e) => {
        if (!intercept(e)) return;
        setDragging(false);
        if (!readOnly) onDrop(e.dataTransfer);
      }}
    >
      {children}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-primary/60 bg-background px-10 py-8 text-sm shadow-lg">
            <HugeiconsIcon icon={Upload04Icon} className="size-8 text-primary" />
            <p className="font-medium">Drop to add to the project</p>
            <p className="text-xs text-muted-foreground">Or drop on a folder in Files</p>
          </div>
        </div>
      )}
    </div>
  );
}
