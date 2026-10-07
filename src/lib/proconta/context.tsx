import { createContext, useContext, useState, type ReactNode } from "react";
import { demo } from "./demo";
const WorkspaceContext = createContext({
  period: demo.period,
  setPeriod: (_value: string) => {},
  firm: demo.firm,
  setFirm: (_value: string) => {},
});
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState(demo.period);
  const [firm, setFirm] = useState(demo.firm);
  return (
    <WorkspaceContext.Provider value={{ period, setPeriod, firm, setFirm }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export const useWorkspace = () => useContext(WorkspaceContext);
