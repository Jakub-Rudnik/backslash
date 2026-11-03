import { useState } from "react";
import { Button } from "./components/ui/button";

function App() {
  const [clicks, setClicks] = useState(0);

  return (
    <>
      <h1>Hello!</h1>
      <Button onClick={() => setClicks((prev) => prev + 1)}>{clicks}</Button>
    </>
  );
}

export default App;
