(() => {
  const ICONS = {"Circle":[["circle",{"cx":"12","cy":"12","r":"10","stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.5","key":"0"}]],"CircleCheck":[["path",{"d":"M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z","stroke":"currentColor","strokeWidth":"1.5","key":"0"}],["path",{"d":"M8 12.5L10.5 15L16 9","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"1.5","key":"1"}]],"AlertTriangle":[["path",{"d":"M13.9248 21H10.0752C5.44476 21 3.12955 21 2.27636 19.4939C1.42317 17.9879 2.60736 15.9914 4.97574 11.9985L6.90057 8.75333C9.17559 4.91778 10.3131 3 12 3C13.6869 3 14.8244 4.91777 17.0994 8.75332L19.0243 11.9985C21.3926 15.9914 22.5768 17.9879 21.7236 19.4939C20.8704 21 18.5552 21 13.9248 21Z","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"1.5","key":"0"}],["path",{"d":"M12 9V13","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"1.5","key":"1"}],["path",{"d":"M12.125 16.75H12M12.25 16.75C12.25 16.8881 12.1381 17 12 17C11.8619 17 11.75 16.8881 11.75 16.75C11.75 16.6119 11.8619 16.5 12 16.5C12.1381 16.5 12.25 16.6119 12.25 16.75Z","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"1.5","key":"2"}]],"Loading":[["path",{"d":"M12 3V6","stroke":"currentColor","strokeLinecap":"round","strokeWidth":"1.5","key":"0"}],["path",{"d":"M12 18V21","stroke":"currentColor","strokeLinecap":"round","strokeWidth":"1.5","key":"1"}],["path",{"d":"M21 12L18 12","stroke":"currentColor","strokeLinecap":"round","strokeWidth":"1.5","key":"2"}],["path",{"d":"M6 12L3 12","stroke":"currentColor","strokeLinecap":"round","strokeWidth":"1.5","key":"3"}],["path",{"d":"M18.3635 5.63672L16.2422 7.75804","stroke":"currentColor","strokeLinecap":"round","strokeWidth":"1.5","key":"4"}],["path",{"d":"M7.75804 16.2422L5.63672 18.3635","stroke":"currentColor","strokeLinecap":"round","strokeWidth":"1.5","key":"5"}],["path",{"d":"M18.3635 18.3635L16.2422 16.2422","stroke":"currentColor","strokeLinecap":"round","strokeWidth":"1.5","key":"6"}],["path",{"d":"M7.75804 7.75804L5.63672 5.63672","stroke":"currentColor","strokeLinecap":"round","strokeWidth":"1.5","key":"7"}]],"CircleQuestion":[["circle",{"cx":"12","cy":"12","r":"10","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"1.5","key":"0"}],["path",{"d":"M9.5 9.5C9.5 8.11929 10.6193 7 12 7C13.3807 7 14.5 8.11929 14.5 9.5C14.5 10.3569 14.0689 11.1131 13.4117 11.5636C12.7283 12.0319 12 12.6716 12 13.5","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"1.5","key":"1"}],["path",{"d":"M12.125 16.75H12M12.25 16.75C12.25 16.8881 12.1381 17 12 17C11.8619 17 11.75 16.8881 11.75 16.75C11.75 16.6119 11.8619 16.5 12 16.5C12.1381 16.5 12.25 16.6119 12.25 16.75Z","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"1.5","key":"2"}]]};
  const LABELS = { inactive: "Project is inactive", working: "Project has working threads", complete: "Project work completed", attention: "Project needs your input" };
  const STATE_CLASS = { inactive: "text-muted-foreground/40", working: "animate-spin text-muted-foreground/50", complete: "text-foreground", attention: "text-warning-text" };
  const STATE_ICON = { inactive: "Circle", working: "Loading", complete: "CircleCheck", attention: "AlertTriangle" };
  const SIZES = [12, 14, 16];
  const STATES = ["inactive", "working", "complete", "attention"];
  const CONTEXTS = [["default", ""], ["selected", "background:var(--sidebar-accent)"], ["hover", "background:color-mix(in oklch, var(--foreground) 8%, transparent)"]];
  function svgFor(state, S) {
    const parts = ICONS[STATE_ICON[state]].map(([tag, attrs]) => {
      const a = Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => k + '="' + v + '"').join(" ");
      return "<" + tag + " " + a + "/>";
    }).join("");
    return '<svg width="' + S + '" height="' + S + '" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="' + STATE_CLASS[state] + '">' + parts + "</svg>";
  }
  const existing = document.getElementById("glyph-state-sheet");
  if (existing) existing.remove();
  const panel = document.createElement("div");
  panel.id = "glyph-state-sheet";
  panel.setAttribute("data-fixture", "temporary-state-sheet");
  panel.style.cssText = "position:fixed;z-index:2147483000;top:48px;left:24px;background:var(--sidebar);color:var(--sidebar-foreground);border:1px solid var(--border);border-radius:8px;padding:10px 12px;box-shadow:0 10px 34px rgba(0,0,0,.4);font-family:inherit";
  const h = document.createElement("div");
  h.textContent = "TEMP FIXTURE · real icon primitives + plugin classes · 12/14/16 DPR1 · state rows";
  h.style.cssText = "font-size:10px;color:var(--muted-foreground);margin-bottom:8px";
  panel.append(h);
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:74px 62px repeat(3,150px);gap:5px 8px;align-items:center";
  const mk = (txt, css) => { const s = document.createElement("span"); s.textContent = txt; s.style.cssText = "font-size:10px;color:var(--muted-foreground);" + (css || ""); return s; };
  grid.append(mk(""), mk("context"));
  for (const s of SIZES) grid.append(mk(s + "px"));
  for (const state of STATES) {
    for (const [ctx, bg] of CONTEXTS) {
      grid.append(mk(state, "text-align:right"), mk(ctx));
      for (const S of SIZES) {
        const r = document.createElement("div");
        r.style.cssText = "display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:5px;" + bg;
        const slot = document.createElement("span");
        slot.setAttribute("data-project-activity", state);
        slot.className = "flex size-4 shrink-0 items-center justify-center";
        const g = document.createElement("span");
        g.className = "ps-project-glyph";
        g.setAttribute("role", "img");
        g.setAttribute("aria-label", LABELS[state]);
        g.setAttribute("data-activity", state);
        g.innerHTML = svgFor(state, S);
        slot.append(g);
        const nm = document.createElement("span");
        nm.className = "min-w-0 flex-1 truncate text-xs font-medium";
        nm.textContent = "project-" + state;
        r.append(slot, nm);
        const cell = document.createElement("div"); cell.append(r);
        grid.append(cell);
      }
    }
  }
  panel.append(grid);
  document.body.append(panel);
  return "sheet built: " + document.querySelectorAll("#glyph-state-sheet .ps-project-glyph").length + " states";
})()