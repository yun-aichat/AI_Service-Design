import PlatformApp from "./app/App";
import TopBar from "./app/TopBar";
import type { ThemeMode } from "./app/shell-types";
import FieldLabel from "./design-system/FieldLabel";
import { JourneyMapPage } from "./tools/journey-map";

function App() {
  return (
    <PlatformApp
      renderJourney={(shellProps) => (
        <JourneyMapPage
          {...shellProps}
          FieldLabel={FieldLabel}
          TopBar={TopBar}
        />
      )}
    />
  );
}

export default App;
