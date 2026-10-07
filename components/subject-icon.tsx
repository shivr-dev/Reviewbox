import {
  BookOpen,
  Calculator,
  Languages,
  GraduationCap,
  Atom,
  FlaskConical,
  Leaf,
  Landmark,
} from 'lucide-react';
const icons = {
  chinese: BookOpen,
  math: Calculator,
  english: Languages,
  ce: GraduationCap,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Leaf,
  history: Landmark,
};
export default function SubjectIcon({
  subject,
  size = 26,
}: {
  subject: string;
  size?: number;
}) {
  const Icon = icons[subject as keyof typeof icons] ?? BookOpen;
  return <Icon size={size} strokeWidth={2.4} aria-hidden="true" />;
}
