import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { useAuth } from '@/features/auth/auth-context';
import { TYPE_LABELS } from './document-types';

export interface DocumentMetadata {
  parties?: string[];
  date?: string | null;
  amount?: string | null;
  keywords?: string[];
}

interface Props {
  documentId: string;
  title: string | null;
  documentType: string | null;
  typeConfidence: number | null;
  metadata: DocumentMetadata;
  language: string | null;
  textSource: string | null;
  editedAt: string | null;
  /** Called when the pointer enters a party, to light up its mention. */
  onHoverParty?: (party: string | null) => void;
}

/**
 * Shows what the model extracted and lets an admin correct it.
 *
 * Saving `parties` re-derives this document's company links server-side, so the
 * knowledge graph follows the correction rather than the original extraction.
 */
export function MetadataPanel(props: Props) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.title ?? '');
  const [documentType, setDocumentType] = useState(props.documentType ?? '');
  const [parties, setParties] = useState((props.metadata.parties ?? []).join(', '));
  const [date, setDate] = useState(props.metadata.date ?? '');
  const [amount, setAmount] = useState(props.metadata.amount ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        title: title.trim(),
        parties: parties
          .split(',')
          .map((party) => party.trim())
          .filter(Boolean),
        date: date.trim() || null,
        amount: amount.trim() || null,
      };
      if (documentType) body.documentType = documentType;
      return (await apiClient.patch(`/documents/${props.documentId}/metadata`, body)).data;
    },
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['document', props.documentId] }),
        queryClient.invalidateQueries({ queryKey: ['graph'] }),
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
      ]);
    },
  });

  if (editing) {
    return (
      <div className="space-y-3 text-sm">
        <Field label="Tiêu đề">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Loại">
          <Select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            <option value="">— giữ nguyên —</option>
            {Object.entries(TYPE_LABELS)
              .filter(([key]) => key !== 'unknown')
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            <option value="other">Khác</option>
          </Select>
        </Field>
        <Field label="Các bên">
          <Input
            value={parties}
            onChange={(e) => setParties(e.target.value)}
            placeholder="Ngăn cách bằng dấu phẩy"
          />
        </Field>
        <Field label="Ngày">
          <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="2026-03-15" />
        </Field>
        <Field label="Giá trị">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>

        {save.isError && (
          <p className="text-sm text-destructive">
            {extractErrorMessage(save.error, 'Không lưu được.')}
          </p>
        )}

        <div className="flex gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Huỷ
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sửa "Các bên" sẽ dựng lại liên kết công ty của tài liệu này trên đồ thị.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <ReadOnly label="Loại">
        {props.documentType ? (
          <span>
            {TYPE_LABELS[props.documentType] ?? props.documentType}
            {props.typeConfidence != null && (
              <span className="text-muted-foreground">
                {' '}
                · {Math.round(props.typeConfidence * 100)}%
                {props.typeConfidence === 1 && ' (đã xác nhận)'}
              </span>
            )}
          </span>
        ) : null}
      </ReadOnly>

      <ReadOnly label="Các bên">
        <span className="flex flex-wrap gap-1">
          {(props.metadata.parties ?? []).map((party) => (
            <button
              key={party}
              type="button"
              onMouseEnter={() => props.onHoverParty?.(party)}
              onMouseLeave={() => props.onHoverParty?.(null)}
            >
              <Badge variant="outline">{party}</Badge>
            </button>
          ))}
        </span>
      </ReadOnly>

      <ReadOnly label="Ngày">{props.metadata.date}</ReadOnly>
      <ReadOnly label="Giá trị">{props.metadata.amount}</ReadOnly>
      <ReadOnly label="Ngôn ngữ">{props.language}</ReadOnly>
      <ReadOnly label="Nguồn văn bản">{props.textSource}</ReadOnly>

      {props.metadata.keywords && props.metadata.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {props.metadata.keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary">
              {keyword}
            </Badge>
          ))}
        </div>
      )}

      {props.editedAt && (
        <p className="pt-1 text-xs text-muted-foreground">
          Đã sửa tay lúc {new Date(props.editedAt).toLocaleString('vi-VN')}
        </p>
      )}

      {can('edit-metadata') && (
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setEditing(true)}>
          Sửa metadata
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ReadOnly({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children || '—'}</span>
    </div>
  );
}
