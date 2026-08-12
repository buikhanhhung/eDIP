import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  Calendar,
  Crosshair,
  FileSignature,
  FileText,
  FolderKanban,
  Link2,
  Quote,
  Receipt,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { FileTypeChip } from '@/components/file-type-chip';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { typeLabel } from '@/features/documents/document-types';
import { ENTITY_COLORS, type GraphNode } from './graph-canvas';

interface RelatedDocument {
  id: string;
  title: string | null;
  filename: string;
  documentType: string | null;
}

interface EntityRelation {
  id: string;
  type: string;
  description: string;
  evidence: string;
  documentId: string;
  otherEntityName: string;
  direction: 'out' | 'in';
}

interface Props {
  node: GraphNode['data'] | null;
  onClose: () => void;
  onFocus: (id: string) => void;
}

/**
 * One icon per entity type, matching the colour the canvas already gave it.
 *
 * The drawer and the dot on the canvas have to agree: a reader who clicked a
 * blue circle should not arrive at a green panel and wonder what they opened.
 */
const ENTITY_ICONS: Record<string, LucideIcon> = {
  company: Building2,
  person: User,
  project: FolderKanban,
  contract: FileSignature,
  invoice: Receipt,
  department: Users,
  date: Calendar,
  amount: Banknote,
};

const FALLBACK_COLOR = '#64748b';

/**
 * Every node on the canvas is an entity now, so this panel is where the
 * documents behind it live — the list the graph stopped drawing.
 */
export function NodeDrawer({ node, onClose, onFocus }: Props) {
  const { data: documents } = useQuery({
    queryKey: ['graph-entity', node?.id],
    queryFn: async () =>
      (await apiClient.get<RelatedDocument[]>(`/graph/entities/${node!.id}/documents`)).data,
    enabled: Boolean(node),
  });

  const { data: relations } = useQuery({
    queryKey: ['graph-entity-relations', node?.id],
    queryFn: async () =>
      (await apiClient.get<EntityRelation[]>(`/graph/entities/${node!.id}/relations`)).data,
    enabled: Boolean(node),
  });

  if (!node) return null;

  const color = ENTITY_COLORS[node.type] ?? FALLBACK_COLOR;
  const Icon = ENTITY_ICONS[node.type] ?? FileText;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[22rem] flex-col border-l border-stroke-soft-200 bg-bg-white-0 shadow-raised">
      {/* A wash of the entity's own colour, so the panel is recognisably about
          the node that was clicked rather than a generic sheet. */}
      <header
        className="shrink-0 border-b border-stroke-soft-200 p-5"
        style={{ backgroundColor: `${color}0f` }}
      >
        <div className="flex items-start gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl text-white"
            style={{ backgroundColor: color }}
          >
            <Icon className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-subheading-xs uppercase" style={{ color }}>
              {node.type}
            </p>
            <h2 className="break-words text-lg font-semibold leading-tight text-text-strong-950">
              {node.label}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-text-soft-400 transition-default hover:bg-bg-white-0 hover:text-text-strong-950"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat icon={FileText} label="Documents" value={node.documentCount} color={color} />
          <Stat icon={Link2} label="Relations" value={relations?.length ?? 0} color={color} />
          {/* Degree counts edges on the canvas, which is not the same as typed
              relations: two entities can share a document without the model
              having named a relationship between them. */}
          <Stat icon={Crosshair} label="Links" value={node.degree} color={color} />
        </div>

        <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => onFocus(node.id)}>
          <Crosshair className="mr-1.5 size-4" />
          Show neighbourhood only
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <section>
          <SectionHead icon={Link2} title="Relations" count={relations?.length ?? 0} color={color} />

          {relations && relations.length > 0 ? (
            <ul className="space-y-2">
              {relations.map((relation) => (
                <li
                  key={relation.id}
                  className="rounded-xl border border-stroke-soft-200 p-3 transition-default hover:border-stroke-sub-300"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      {relation.type}
                    </span>
                    {/* The arrow carries the direction; the colour only says
                        which entity this panel is about. */}
                    {relation.direction === 'out' ? (
                      <ArrowRight className="size-3.5 text-text-soft-400" />
                    ) : (
                      <ArrowLeft className="size-3.5 text-text-soft-400" />
                    )}
                    <span className="min-w-0 truncate text-sm font-medium text-text-strong-950">
                      {relation.otherEntityName}
                    </span>
                  </div>

                  {/* Every typed edge shows the sentence it came from, so a
                      reader can reject it without leaving the drawer. */}
                  <blockquote className="mt-2 flex gap-1.5 rounded-lg bg-bg-weak-50 p-2">
                    <Quote className="size-3 shrink-0 text-text-soft-400" />
                    <span className="text-xs italic leading-relaxed text-text-sub-600">
                      {relation.evidence}
                    </span>
                  </blockquote>

                  <Link
                    to={`/documents/${relation.documentId}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary-base hover:underline"
                  >
                    <FileText className="size-3" />
                    Source document
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-sub-600">
              No relationship to another entity was extracted for this one.
            </p>
          )}
        </section>

        <section>
          <SectionHead
            icon={FileText}
            title="Appears in"
            count={documents?.length ?? 0}
            color={color}
          />

          {documents && documents.length > 0 ? (
            <ul className="space-y-2">
              {documents.map((document) => (
                <li key={document.id}>
                  <Link
                    to={`/documents/${document.id}`}
                    className="flex items-center gap-2.5 rounded-xl border border-stroke-soft-200 p-2.5 transition-default hover:border-primary-base"
                  >
                    <FileTypeChip filename={document.filename} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text-strong-950">
                        {document.title ?? document.filename}
                      </span>
                      <span className="block truncate text-xs text-text-soft-400">
                        {document.documentType ? typeLabel(document.documentType) : document.filename}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-sub-600">No document is linked to this entity.</p>
          )}
        </section>
      </div>
    </aside>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-bg-white-0 px-2 py-2 text-center">
      <Icon className="mx-auto size-3.5" style={{ color }} />
      <p className="mt-1 text-base font-semibold leading-none tabular-nums text-text-strong-950">
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] uppercase tracking-wide text-text-soft-400">
        {label}
      </p>
    </div>
  );
}

function SectionHead({
  icon: Icon,
  title,
  count,
  color,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  color: string;
}) {
  return (
    <div className={cn('mb-2.5 flex items-center gap-2')}>
      <Icon className="size-4" style={{ color }} />
      <h3 className="text-sm font-semibold text-text-strong-950">{title}</h3>
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        {count}
      </span>
    </div>
  );
}
