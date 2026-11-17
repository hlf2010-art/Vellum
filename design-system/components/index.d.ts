/** Vellum components. Hand-written from Vellum-Lumen.html (branch claude/lumen-v2 @ 92098dc); global `window.Vellum`. */
export type Lineage = 'A' | 'B' | 'C' | 'D';
export type Weight = 'observed' | 'reported' | 'proposed' | 'illustrative';
export type CrewMember = 'scout' | 'strategist' | 'wright' | 'critic';

export interface CardProps {
  /** Which card. Sets width, title style and body. `print` is an alias of `snapshot`. */
  kind?: 'source' | 'recording' | 'image' | 'frame' | 'audio' | 'link' | 'notepad'
       | 'idea' | 'synthesis' | 'direction' | 'question' | 'note'
       | 'proof' | 'list' | 'kanban' | 'snapshot' | 'print' | 'group';
  title?: string;
  /** Body copy (`body`, `label-2`); for `group`, the child cards. */
  children?: React.ReactNode;
  /** Kind-line text, e.g. "MD · Playtest Telemetry", "Question on Proof B v2". */
  eyebrow?: string;
  /** Crew byline (18px orb) for crew-made cards. */
  by?: CrewMember;
  /** Direction, proof, question, snapshot, group tint. */
  lineage?: Lineage;
  /** Evidence pill in the footer (evidence kinds). */
  weight?: Weight;
  /** Right side of the footer, e.g. "2 notes · 5:44 AM". */
  meta?: string;
  /** Left side of the footer when there is no weight, e.g. "Explore Desk". */
  footLeft?: React.ReactNode;
  /** Media kinds: poster / thumbnail URL. */
  image?: string; imageAlt?: string;
  /** Media badge, e.g. "WEBM", "JPEG". */
  badge?: string;
  /** recording / frame: "0:08", "@ 0:04.2". */
  timecode?: string;
  aspect?: string;
  /** direction: the line that could prove it wrong. */
  test?: string;
  /** audio */
  duration?: string; progress?: number;
  /** link: shown in mono without the scheme. */
  url?: string;
  /** notepad: long text, line breaks kept. */
  text?: string;
  /** idea / synthesis: evidence-mix bar and "N/M rated". */
  rating?: { observed?: number; reported?: number; unrated?: number };
  /** synthesis */
  points?: { label?: string; text: string }[];
  /** proof */
  version?: string; sources?: string[];
  /** list */
  items?: { text: string; done?: boolean }[];
  /** kanban (three columns, tinted A, B, C unless `lineage` given) */
  columns?: { title: string; items: string[]; lineage?: Lineage }[];
  /** snapshot */
  edition?: number; of?: string;
  adopted?: boolean; disliked?: boolean; lit?: boolean;
  /** Only you can change it: shows a lock badge. */
  locked?: boolean;
  /** A crew-suggested change to a kept card. */
  proposal?: { member?: CrewMember; op?: 'edit' | 'delete' | 'link'; from?: string; open?: boolean; field?: string; diff?: [string, string]; stale?: boolean };
  width?: number | string;
  headExtra?: React.ReactNode;
  /** Selected on the board: a focus-colour ring. */
  selected?: boolean;
  /** `loading`: the crew is reading or writing this card (a light sweep; static under reduced motion). `error`: the last crew action on it failed. */
  state?: 'idle' | 'loading' | 'error';
  /** Error line shown when `state` is `error`. Default "Couldn’t finish. Your card is unchanged." */
  error?: string;
  /** Shows a Retry button in the error line. */
  onRetry?: () => void;
  /** Click / Enter on the card. */
  onSelect?: () => void;
  /** Cards are focusable by default (0). Pass -1 inside a roving-focus board. */
  tabIndex?: number;
}
export interface LineageChipProps { lineage?: Lineage; size?: 'md' | 'lg'; /** Ring around the chip, e.g. the active filter. */ selected?: boolean; }
export interface EvidenceWeightProps { weight?: Weight; }
export type CrewState = 'free' | 'working' | 'waiting';
export interface CrewMarkProps { member?: CrewMember; state?: CrewState; working?: boolean; size?: 'md' | 'sm' | 'xs'; }
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Name of a Vellum icon: select, lasso, hand, upload, organize, undo, redo, plus, mic, send, enhance, command, search, doc, x, check, chevron, play, notepad, video, image, audio, link, frame, group, lock, sliders, retry, copy, arrow, eyeOff, archive, trash, ask. */
  icon?: string;
  children?: React.ReactNode;
  /** sm 28px (toasts, bars), md 32px (default), lg 36px (sheets). */
  size?: 'sm' | 'md' | 'lg';
  /** Shows a spinner, sets aria-busy and blocks clicks. Keep the label. */
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: (e: any) => void;
  /** Required for icon-only buttons; also becomes the tooltip. */
  'aria-label'?: string;
}
export interface ReviewPillProps { count?: number; label?: string; onClick?: () => void; }
export interface ToolRailProps {
  active?: 'select' | 'lasso' | 'hand';
  orientation?: 'vertical' | 'horizontal';
  /** Tool ids to disable, e.g. ['undo','redo'] on a fresh board. */
  disabled?: string[];
}
export interface ComposerProps {
  /** Default "Write an idea, or / for commands". */
  placeholder?: string; value?: string; hint?: string;
  /** Who handles the request; the chip appears once there is text (or with showRoute). */
  route?: { member?: CrewMember | null; label: string }; showRoute?: boolean;
  /** Enter sends, Shift+Enter breaks the line; the field grows to 160px. */
  onSend?: (text: string) => void;
  /** Mic is recording: danger tint, aria-pressed. */
  recording?: boolean;
}
export interface ToastAction { label: string; icon?: string; variant?: 'ghost' | 'secondary' | 'primary'; onClick?: () => void; }
export interface ToastProps { member?: CrewMember; children?: React.ReactNode; /** Shorthand for a single Undo action. */ undo?: boolean; actions?: ToastAction[]; /** `error`: role=alert, alert icon, danger ring. */ tone?: 'neutral' | 'error'; }
export interface DraftBarProps { member?: CrewMember; /** e.g. "1 direction", "3 proofs" */ what?: string; count?: number; index?: number; onDiscard?: () => void; onRetry?: () => void; onKeep?: () => void; }
export interface IslandTask { member: CrewMember; title: string; /** Present-tense verb: "Rendering", "Reading 4 sources" */ phase: string; pct?: number | null; elapsed?: string; /** Default `running`. `done` and `failed` stay visible until dismissed. */ state?: 'running' | 'queued' | 'done' | 'failed'; /** Replaces the phase line, e.g. "Model timed out". */ note?: string; /** Failed tasks: shows Retry. */ onRetry?: () => void; }
export interface TaskIslandProps { tasks?: IslandTask[]; open?: boolean; }
export interface CrewBarProps { seats?: Partial<Record<CrewMember, CrewState>>; connection?: 'none' | 'ok' | 'rules' | 'error'; /** Model pill text, e.g. "Offline"; false hides it. */ mode?: string | false; quiet?: boolean; }
export interface CrewSettingsProps { status?: string; /** Initial value; the control is interactive (arrow keys move between options). */ speaks?: 'Never' | 'When it matters' | 'Often'; acts?: 'Only drafts' | 'Can create cards'; lanes?: string[]; locked?: string[]; onChange?: (v: { speaks: string; acts: string; locked: string[] }) => void; }
export interface CardMenuItem { label: string; icon?: string; key?: string; danger?: boolean; onClick?: () => void; }
export interface CardMenuProps { title?: string; kind?: string; locked?: boolean; items?: (CardMenuItem | '-')[]; /** Escape. Arrow keys, Home and End move between items. */ onClose?: () => void; /** Focus the first item on open. Use when the menu opens from a right-click or keypress. */ autoFocus?: boolean; }

/* ── App parts ─────────────────────────────────────────────────────────── */
export interface SheetProps {
  title: string;
  /** Card kind; shown with the author as one phrase ("Synthesis by Scout"). */
  kind?: CardProps['kind']; kindLabel?: string;
  /** Crew member who made it. Omit or 'you' for your own cards: no byline. */
  by?: CrewMember | 'you';
  /** Engine for the tooltip: "local service", "built-in rules", a model name. */
  engine?: string;
  /** Shown only from v2. */
  rev?: number;
  /** Relative time ("3 h ago") and the full date for its tooltip. */
  time?: string; timeFull?: string;
  lineage?: Lineage;
  /** Round filled buttons before Close (votes, More). */
  tools?: React.ReactNode;
  children?: React.ReactNode;
  /** The note composer; false hides it. */
  composer?: { placeholder?: string; onSend?: (text: string) => void } | false;
  onClose?: () => void;
  width?: number | string; bodyHeight?: number | string;
}
export interface SheetSectionProps { title?: string; meta?: React.ReactNode; children?: React.ReactNode; }
export interface SourceRowProps {
  /** Kind label shown above the title ("Question", "Direction B"). */
  kind: string;
  /** The full title. Never clip it. */
  title: string;
  weight?: Weight;
  /** Exceptions only; the default (live) link shows nothing. */
  status?: 'changed' | 'frozen' | 'unavailable' | 'archived' | 'hidden'; statusLabel?: string;
  onOpen?: () => void;
}
export interface EvidenceBlocksProps { observed?: number; reported?: number; proposed?: number; unrated?: number; /** Caption; false hides it. Default "Evidence behind it". */ label?: string | false; }
export interface OverviewProps {
  zoom?: number;
  /** Index of the stage in view. */
  stage?: number;
  stages?: string[];
  /** Stage indexes with crew work waiting (a dot on the tab). */
  pending?: number[];
  title?: string;
  /** Schematic cards: [stage, x, y, w, h, tone] with x..h as 0–1 fractions and tone 0 | 'A'–'D' | 'note'. */
  cards?: [number, number, number, number, number, 0 | Lineage | 'note'][];
  onStage?: (i: number) => void;
}
export interface WireProps { from?: [number, number]; to?: [number, number]; lineage?: Lineage; state?: 'hover' | 'reference' | 'stale'; width?: number; height?: number; absolute?: boolean; }
export interface PortProps { side?: 'left' | 'right' | 'top' | 'bottom'; kind?: 'in' | 'out'; connected?: boolean; /** Force visible (otherwise shown on card hover or focus). */ visible?: boolean; }
export interface StageHeaderProps { step?: string; name?: string; sub?: string; locked?: boolean; onLock?: (locked: boolean) => void; }
export interface StripItem { label: string; icon?: string; iconOnly?: boolean; danger?: boolean; lineage?: boolean; key?: string; onClick?: () => void; }
export interface SelectionStripProps { /** Groups are separated by space, not bars. */ groups?: StripItem[][]; lineage?: Lineage; label?: string; }
export interface CrewCursorProps { member?: CrewMember; /** Present tense, counted when possible: "Reading 3/7". */ label?: string; }
export interface CommandItem { cmd: string; member?: CrewMember; desc: string; hint?: string; }
export interface CommandMenuProps { title?: string; items?: CommandItem[]; active?: number; onPick?: (item: CommandItem) => void; }
export interface DialogProps { title: string; children?: React.ReactNode; /** Verbs that repeat the outcome, never OK/Cancel. */ actions?: React.ReactNode; scrim?: boolean; onClose?: () => void; width?: number | string; }

/* ── Primitives ────────────────────────────────────────────────────────── */
export interface SegmentedProps { label?: string; options?: string[]; value?: string; onChange?: (v: string) => void; }
export interface TooltipProps { label: string; /** Shown after a middle dot: "Undo · ⌘Z". */ shortcut?: string; side?: 'top' | 'bottom'; open?: boolean; children: React.ReactElement; }
export interface KbdProps { children?: React.ReactNode; }
export interface TagProps { tone?: 'ok' | 'warn' | 'danger' | 'lineage'; lineage?: Lineage; icon?: string; children?: React.ReactNode; }
export interface TextFieldProps { label?: string; value?: string; placeholder?: string; help?: string; error?: string; optional?: boolean; disabled?: boolean; multiline?: boolean; rows?: number; onChange?: (v: string) => void; }
export interface CheckboxProps { label?: string; checked?: boolean; disabled?: boolean; onChange?: (v: boolean) => void; }
export interface SwitchProps { label?: string; help?: string; checked?: boolean; disabled?: boolean; onChange?: (v: boolean) => void; }
export interface TabsProps { tabs?: { id: string; label: string; count?: number }[]; value?: string; label?: string; onChange?: (id: string) => void; }
export interface ProgressProps { /** 0–100; omit for indeterminate. */ value?: number | null; label?: string; member?: CrewMember; showValue?: boolean; }
export interface ProgressRingProps { value?: number | null; size?: number; member?: CrewMember; label?: string; }
export interface SkeletonProps { card?: boolean; width?: number | string; height?: number | string; round?: boolean; }
export interface EmptyStateProps { icon?: string; title?: string; children?: React.ReactNode; action?: React.ReactNode; }
export interface InlineAlertProps { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: string; children?: React.ReactNode; action?: React.ReactNode; }

export declare function Card(p: CardProps): JSX.Element;
export declare function LineageChip(p: LineageChipProps): JSX.Element;
export declare function EvidenceWeight(p: EvidenceWeightProps): JSX.Element;
export declare function CrewMark(p: CrewMarkProps): JSX.Element;
export declare function Button(p: ButtonProps): JSX.Element;
export declare function ReviewPill(p: ReviewPillProps): JSX.Element;
export declare function ToolRail(p: ToolRailProps): JSX.Element;
export declare function Composer(p: ComposerProps): JSX.Element;
export declare function Toast(p: ToastProps): JSX.Element;
export declare function DraftBar(p: DraftBarProps): JSX.Element;
export declare function TaskIsland(p: TaskIslandProps): JSX.Element;
export declare function CrewBar(p: CrewBarProps): JSX.Element;
export declare function CrewSettings(p: CrewSettingsProps): JSX.Element;
export declare function CardMenu(p: CardMenuProps): JSX.Element;
/** Wrap every Vellum render in Root: it sets the font and button resets. */
export declare function Root(p: { children?: React.ReactNode; className?: string; style?: any }): JSX.Element;
export declare function Icon(p: { name: string; className?: string }): JSX.Element;
export declare function Sheet(p: SheetProps): JSX.Element;
export declare function SheetSection(p: SheetSectionProps): JSX.Element;
export declare function SourceRow(p: SourceRowProps): JSX.Element;
export declare function EvidenceBlocks(p: EvidenceBlocksProps): JSX.Element;
export declare function Overview(p: OverviewProps): JSX.Element;
export declare function Wire(p: WireProps): JSX.Element;
export declare function Port(p: PortProps): JSX.Element;
export declare function StageHeader(p: StageHeaderProps): JSX.Element;
export declare function SelectionStrip(p: SelectionStripProps): JSX.Element;
export declare function CrewCursor(p: CrewCursorProps): JSX.Element;
export declare function CommandMenu(p: CommandMenuProps): JSX.Element;
export declare function Dialog(p: DialogProps): JSX.Element;
export declare function Segmented(p: SegmentedProps): JSX.Element;
export declare function Tooltip(p: TooltipProps): JSX.Element;
export declare function Kbd(p: KbdProps): JSX.Element;
export declare function Tag(p: TagProps): JSX.Element;
export declare function TextField(p: TextFieldProps): JSX.Element;
export declare function Checkbox(p: CheckboxProps): JSX.Element;
export declare function Switch(p: SwitchProps): JSX.Element;
export declare function Tabs(p: TabsProps): JSX.Element;
export declare function Progress(p: ProgressProps): JSX.Element;
export declare function ProgressRing(p: ProgressRingProps): JSX.Element;
export declare function Skeleton(p: SkeletonProps): JSX.Element;
export declare function EmptyState(p: EmptyStateProps): JSX.Element;
export declare function InlineAlert(p: InlineAlertProps): JSX.Element;

export interface ProofVersion { ver: number; image?: string; results?: { passed?: number; failed?: number; waiting?: number }; failed?: string[]; /** What the next version changed (shown when viewing this one). */ changed?: string; }
export interface ProofCardProps {
  title: string; lineage?: Lineage; format?: 'page' | 'tour' | 'deck';
  /** The direction's test. Not shown on the card (it lives on the direction and in the sheet); kept for the sheet. */
  test?: string;
  versions?: ProofVersion[]; viewing?: number;
  state?: 'idle' | 'building'; buildNote?: string;
  /** Number of sources changed since the latest version. */
  sourcesChanged?: number;
  sources?: number; time?: string; iterating?: boolean;
  onOpen?: () => void; onFix?: () => void; onRebuild?: () => void; onTest?: () => void; onSnapshot?: () => void; /** "Change": select the card and focus the composer. */ onChange?: () => void; onIterate?: (text: string) => void;
}
export declare function ProofCard(p: ProofCardProps): JSX.Element;
