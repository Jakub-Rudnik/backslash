import { useState } from "react";
import { LatexEditor } from "@/components/latex-editor";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { PdfViewer } from "@/components/pdf-viewer";

const INITIAL_SOURCE = String.raw`\documentclass{article}
\begin{document}
Hello, \LaTeX!
\end{document}
`;

function App() {
  const [source, setSource] = useState(INITIAL_SOURCE);

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel>
        <div className="h-screen">
          <LatexEditor value={source} onChange={setSource} className="h-full" />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel>
        <PdfViewer url="/sample.pdf" className="h-screen overflow-auto bg-muted p-4" />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export default App;
