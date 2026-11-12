import { Modal } from "./modal";
import { Loader2 } from "lucide-react";

export function LoadingModal({ isOpen, text }: { isOpen: boolean; text: string }) {
  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Procesando...">
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-slate-600 font-medium text-center">{text}</p>
      </div>
    </Modal>
  );
}