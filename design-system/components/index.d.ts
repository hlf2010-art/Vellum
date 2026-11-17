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
}
export interface LineageChipProps { lineage?: Lineage; size?: 'md' | 'lg'; }
export interface EvidenceWeightProps { weight?: Weight; }
export type CrewState = 'free' | 'working' | 'waiting';
export interface CrewMarkProps { member?: CrewMember; state?: CrewState; working?: boolean; size?: 'md' | 'sm' | 'xs'; }
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Name of a Vellum icon: select, lasso, hand, upload, organize, undo, redo, plus, mic, send, enhance, command, search, doc, x, check, chevron, play, notepad, video, image, audio, link, frame, group, lock, sliders, retry, copy, arrow, eyeOff, archive, trash, ask. */
  icon?: string;
  children?: React.ReactNode; disabled?: boolean; type?: 'button' | 'submit';
  onClick?: (e: any) => void; 'aria-label'?: string;
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
  onSend?: (text: string) => void;
}
export interface ToastAction { label: string; icon?: string; variant?: 'ghost' | 'secondary' | 'primary'; onClick?: () => void; }
export interface ToastProps { member?: CrewMember; children?: React.ReactNode; /** Shorthand for a single Undo action. */ undo?: boolean; actions?: ToastAction[]; }
export interface DraftBarProps { member?: CrewMember; /** e.g. "1 direction", "3 proofs" */ what?: string; count?: number; index?: number; onDiscard?: () => void; onRetry?: () => void; onKeep?: () => void; }
export interface IslandTask { member: CrewMember; title: string; /** Present-tense verb: "Rendering", "Reading 4 sources" */ phase: string; pct?: number | null; elapsed?: string; }
export interface TaskIslandProps { tasks?: IslandTask[]; open?: boolean; }
export interface CrewBarProps { seats?: Partial<Record<CrewMember, CrewState>>; connection?: 'none' | 'ok' | 'rules' | 'error'; /** Model pill text, e.g. "Offline"; false hides it. */ mode?: string | false; quiet?: boolean; }
export interface CrewSettingsProps { status?: string; speaks?: 'Never' | 'When it matters' | 'Often'; acts?: 'Only drafts' | 'Can create cards'; lanes?: string[]; locked?: string[]; }
export interface CardMenuItem { label: string; icon?: string; key?: string; danger?: boolean; }
export interface CardMenuProps { title?: string; kind?: string; locked?: boolean; items?: (CardMenuItem | '-')[]; }

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
