// Root — currently the debug screen (0.4d drop table + 0.8 persistence panel).
import { DropTable } from './debug/DropTable';
import { PersistencePanel } from './debug/PersistencePanel';

export function App() {
  return (
    <>
      <DropTable />
      <PersistencePanel />
    </>
  );
}
