# Session Notes

---

## 2026-05-27 — Dashboard shell audit & fix (layout.tsx, template.tsx, globals.css)

### Cosa
Audit tecnico e fix del dashboard shell su 4 assi:

1. **`bg-background` su `<main>`** — sostituito `bg-gray-50 dark:bg-gray-950` con il token CSS `bg-background`. Rimosso anche il ridondante `desktop:pb-6` (già coperto da `desktop:p-6`).

2. **Breakpoint `desktop:p-6`** — rinominato `md:p-6` (768px) in `desktop:p-6` (1440px) per allineamento alle convenzioni di progetto.

3. **Token `--warning`** — introdotti `--warning`, `--warning-foreground`, `--warning-border` in tutti i 12 blocchi CSS di `globals.css` (`:root`, `.dark`, e i 5 temi custom × 2 modalità light/dark). Registrati in `@theme inline` come `--color-warning*` per esporli come utility Tailwind (`bg-warning`, `text-warning-foreground`, `border-warning-border`). Il banner demo ora usa questi token al posto delle 6 classi amber hardcoded.

4. **`useReducedMotion` in template.tsx** — il `style` inline (`opacity: 0; transform: translateY(4px)`) viene omesso quando `prefers-reduced-motion: reduce` è attivo, evitando un flash di 1 frame per gli utenti che hanno disabilitato le animazioni.

### Perché

- **`bg-gray-50 dark:bg-gray-950`** ignorava completamente il sistema CSS-var dei 6 temi: il content area rimaneva grigio neutro anche su temi con background tinti (solar-dusk ambra, retro-arcade verde-giallo, ecc.). Con `bg-background` il colore si adatta automaticamente.

- **`md:p-6`** scattava a 768px, coprendo tablet e landscape mobile in modo inconsistente con il resto dell'app (che usa uniformemente `desktop:` a 1440px). I tablet tra 768–1439px ricevevano `p-6` anziché `p-4`.

- **Token amber hardcoded** — il banner demo usava 6 classi Tailwind palette (`border-amber-200`, `bg-amber-50`, `text-amber-800`, `dark:border-amber-800/60`, `dark:bg-amber-950/40`, `dark:text-amber-300`) fuori dal sistema di token, rendendo il componente non-aware dei temi. Secondariamente, le due span usavano shade inconsistenti tra loro (`text-amber-700`/`dark:text-amber-400` vs `text-amber-800`/`dark:text-amber-300` del padre).

- **`style` pre-hydration** — con `MotionConfig reducedMotion="user"` in layout.tsx, Framer Motion salta le durations ma non può annullare il `style` inline applicato dal browser prima del paint. Per utenti reduced-motion, il contenuto partiva invisibile per ~1 frame senza alcun payoff animativo.

### Nota

- **Valore dei `--warning` token oltre il banner demo**: con `--color-warning*` in `@theme inline`, le utility `bg-warning`, `text-warning-foreground`, `border-warning-border` sono ora disponibili globalmente per toast, alert, stati di validazione — senza introdurre nuova dipendenza da classi hardcoded.

- **Amber uniforme tra temi**: i valori oklch di `--warning` sono identici per tutti i temi (light: `oklch(0.986 0.022 90)` / dark: `oklch(0.260 0.038 78)`). L'amber semantico per "cautela" non varia per tema — è una scelta intenzionale, non una mancanza.

- **`desktop:pb-6` era ridondante**: nella stringa originale `p-4 md:p-6 desktop:pb-6`, il `desktop:pb-6` non aggiungeva nulla perché `md:p-6` aveva già impostato `pb-6` a 768px+. Dopo il fix `p-4 desktop:p-6`, la classe è stata rimossa per evitare confusione.

- **`useReducedMotion` è un hook Framer Motion, non React**: si importa da `framer-motion`, non da `react`. Il valore è `true | false | null` — `null` durante SSR (no window). La condizione `!prefersReducedMotion` applica correttamente il `style` durante SSR (null è falsy → `style` presente → coerente col comportamento pre-fix).

- **File toccati**: `app/dashboard/layout.tsx`, `app/dashboard/template.tsx`, `app/globals.css`.
