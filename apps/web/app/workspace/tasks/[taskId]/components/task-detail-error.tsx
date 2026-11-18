export function TaskDetailError({ message }: { message: string }) {
  return <p className="productivity-error task-detail__error" role="alert">{message}</p>;
}
