import AppEntry from '../components/app-entry';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireChatGPTUser('/');
  return <AppEntry />;
}
