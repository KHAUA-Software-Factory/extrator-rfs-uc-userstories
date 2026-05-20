import Button from 'react-bootstrap/Button';

type ResultItemActionsProps = {
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
};

export function ResultItemActions({
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: ResultItemActionsProps) {
  return (
    <div className="result-item-actions">
      <Button
        type="button"
        size="sm"
        variant="outline-secondary"
        className="result-icon-button"
        onClick={onEdit}
        aria-label={editLabel}
        title={editLabel}
      >
        <PencilIcon />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline-danger"
        className="result-icon-button"
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <TrashIcon />
      </Button>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.7 4.3 19.7 9.3 8.6 20.4 3.8 21.2 4.6 16.4 14.7 4.3Z" />
      <path d="M13.5 5.5 18.5 10.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7H19" />
      <path d="M9 7V5H15V7" />
      <path d="M8 10V18" />
      <path d="M12 10V18" />
      <path d="M16 10V18" />
      <path d="M7 7 8 21H16L17 7" />
    </svg>
  );
}
