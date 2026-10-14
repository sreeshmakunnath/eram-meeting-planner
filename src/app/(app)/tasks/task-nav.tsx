import Link from "next/link";
import { Tabs } from "@/components/ui";

export function TaskTabs({ active, qs = "" }: { active: "list" | "board" | "timeline"; qs?: string }) {
  const q = qs ? `?${qs}` : "";
  return (
    <Tabs
      active={`/tasks${active === "list" ? "" : `/${active}`}${q}`}
      items={[
        { href: `/tasks${q}`, label: "List" },
        { href: `/tasks/board${q}`, label: "Board" },
        { href: `/tasks/timeline${q}`, label: "Timeline" },
      ]}
    />
  );
}

export function NewTaskButton() {
  return (
    <Link href="/tasks/new" className="btn-primary">
      New task
    </Link>
  );
}
