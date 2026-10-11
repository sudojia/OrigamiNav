/** Server Action result contract shared by actions, guards and forms. */
export type ActionState = {
  ok: boolean;
  message: string;
  field?: string;
};
