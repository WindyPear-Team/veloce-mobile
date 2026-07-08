import { createContext } from "react";

export interface AuthContextValue {
  token: string;
  setToken: (token: string) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  token: "",
  setToken: () => undefined,
});

