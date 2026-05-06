import { useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Settings, Sun, Swords } from "lucide-react";
import { defaultPromptGraph } from "./defaultGraph";
import { ConfigurationScreen } from "./components/ConfigurationScreen";
import { GameplayScreen } from "./components/GameplayScreen";
import { loadJson, saveJson } from "./lib/storage";
import type { PromptGraph } from "./types";

const SYSTEMS_KEY = "llm-chess-lite:prompt-systems";
const THEME_KEY = "llm-chess-lite:theme";

type View = "play" | "config";
type ThemeMode = "system" | "light" | "dark";

function cloneGraph(graph: PromptGraph): PromptGraph {
  return JSON.parse(JSON.stringify(graph)) as PromptGraph;
}

export function App() {
  const [view, setView] = useState<View>("play");
  const [systems, setSystems] = useState<PromptGraph[]>(() =>
    loadJson<PromptGraph[]>(SYSTEMS_KEY, [cloneGraph(defaultPromptGraph)])
  );
  const [selectedSystemId, setSelectedSystemId] = useState(systems[0]?.id || defaultPromptGraph.id);
  const [gameActive, setGameActive] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadJson<ThemeMode>(THEME_KEY, "system"));
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    saveJson(SYSTEMS_KEY, systems);
  }, [systems]);

  useEffect(() => {
    saveJson(THEME_KEY, themeMode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setResolvedTheme(themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode]);

  const selectedSystem = useMemo(() => {
    return systems.find((system) => system.id === selectedSystemId) || systems[0] || defaultPromptGraph;
  }, [selectedSystemId, systems]);

  const upsertSystem = (next: PromptGraph) => {
    setSystems((current) => {
      const exists = current.some((system) => system.id === next.id);
      if (exists) return current.map((system) => (system.id === next.id ? cloneGraph(next) : system));
      return [...current, cloneGraph(next)];
    });
    setSelectedSystemId(next.id);
  };

  const deleteSystem = (id: string) => {
    setSystems((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((system) => system.id !== id);
      if (selectedSystemId === id) setSelectedSystemId(next[0]?.id || "");
      return next;
    });
  };

  const changeView = (next: View) => {
    if (next === view) return;
    if (gameActive && next === "config") {
      const shouldEnd = window.confirm("Opening configuration will end the active game. Continue?");
      if (!shouldEnd) return;
      setGameActive(false);
    }
    setView(next);
  };

  const cycleTheme = () => {
    setThemeMode((current) => (current === "system" ? "dark" : current === "dark" ? "light" : "system"));
  };

  const ThemeIcon = themeMode === "system" ? Monitor : themeMode === "dark" ? Moon : Sun;

  return (
    <div className="app-shell" data-theme={resolvedTheme}>
      <header className="top-bar">
        <div>
          <div className="eyebrow">LLM Chess Lite</div>
          <h1>Prompt Logic Chess</h1>
        </div>
        <nav className="view-tabs" aria-label="Primary">
          <button className={view === "play" ? "active" : ""} onClick={() => changeView("play")}>
            <Swords size={16} />
            Play
          </button>
          <button className={view === "config" ? "active" : ""} onClick={() => changeView("config")}>
            <Settings size={16} />
            Configuration
          </button>
          <button className="theme-button" onClick={cycleTheme} title={`Theme: ${themeMode}`}>
            <ThemeIcon size={16} />
          </button>
        </nav>
      </header>

      {view === "play" ? (
        <GameplayScreen systems={systems} onGameActiveChange={setGameActive} />
      ) : (
        <ConfigurationScreen
          systems={systems}
          selectedSystem={selectedSystem}
          selectedSystemId={selectedSystemId}
          locked={false}
          onSelectSystem={setSelectedSystemId}
          onSaveSystem={upsertSystem}
          onDeleteSystem={deleteSystem}
        />
      )}
    </div>
  );
}
