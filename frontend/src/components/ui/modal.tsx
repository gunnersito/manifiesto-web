"use client";
import { useEffect, useRef } from "react";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen) {
            // showModal() bloquea el fondo y lo centra
            if (!dialog.open) dialog.showModal();
        } else {
            if (dialog.open) dialog.close();
        }
    }, [isOpen]);

    // Cerrar al hacer clic fuera (en el backdrop)
    const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
        if (e.target === dialogRef.current) {
            onClose();
        }
    };

    return (
        <dialog
            ref={dialogRef}
            onClose={onClose}
            onClick={handleBackdropClick}
            className="p-0 rounded-2xl shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm bg-transparent"
        >
            {/* Contenedor del modal con estilos de Tailwind */}
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
                    >
                        {/* Icono X simple */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </dialog>
    );
}