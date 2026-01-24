
import React, { useState } from 'react';
import { supabaseService } from '../services/supabase';

interface UserRegistrationProps {
    onComplete: (name: string, pin: string) => void;
}

const UserRegistration: React.FC<UserRegistrationProps> = ({ onComplete }) => {
    const [name, setName] = useState('');
    const [step, setStep] = useState<'NAME' | 'PIN_REVEAL' | 'LOGIN'>('NAME');
    const [generatedPin, setGeneratedPin] = useState('');
    const [loginPin, setLoginPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const generatePin = () => {
        return Math.floor(1000 + Math.random() * 9000).toString();
    };

    const handleNameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (name.trim().length > 0) {
            setLoading(true);
            const user = await supabaseService.getUser(name.trim());
            setLoading(false);

            if (user) {
                // User exists, ask for PIN
                setStep('LOGIN');
            } else {
                // New user, generate PIN
                const pin = generatePin();
                setGeneratedPin(pin);
                setStep('PIN_REVEAL');
            }
        }
    };

    const handleRegistrationConfirm = async () => {
        setLoading(true);
        const success = await supabaseService.register(name.trim(), generatedPin);
        setLoading(false);
        if (success) {
            onComplete(name.trim(), generatedPin);
        } else {
            setError("Erro ao criar conta. Tente outro nome.");
            setStep('NAME');
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const user = await supabaseService.login(name.trim(), loginPin);
        setLoading(false);

        if (user) {
            onComplete(name.trim(), user.pin || loginPin);
        } else {
            setError("PIN incorreto ou usuário não encontrado.");
        }
    };

    return (
        <div className="h-full flex flex-col items-center justify-center p-8 w-full max-w-md mx-auto">
            <div className="w-full bg-[#0A0A0A] p-8 rounded-[2.5rem] shadow-2xl border border-[#1A120D] text-center relative overflow-hidden">

                {step === 'NAME' && (
                    <>
                        <h2 className="text-3xl font-black text-white mb-2 uppercase italic tracking-tighter">Identificação</h2>
                        <p className="text-zinc-600 mb-8 text-[10px] font-black uppercase tracking-[0.2em]">Crie ou acesse sua conta</p>
                        <form onSubmit={handleNameSubmit} className="w-full space-y-6">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value.toUpperCase())}
                                placeholder="SEU NOME"
                                className="w-full bg-[#121212] text-white text-center py-4 rounded-xl border border-[#333] focus:border-[#FF6B00] outline-none font-bold text-xl placeholder-zinc-800 uppercase"
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={!name.trim() || loading}
                                className="w-full py-5 bg-[#FF6B00] text-[#121212] rounded-xl font-black text-lg uppercase italic tracking-wider active:scale-95 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(255,107,0,0.3)]"
                            >
                                {loading ? 'Verificando...' : 'Continuar'}
                            </button>
                            {error && <p className="text-red-500 text-xs font-bold uppercase">{error}</p>}
                        </form>
                    </>
                )}

                {step === 'PIN_REVEAL' && (
                    <>
                        <h2 className="text-3xl font-black text-[#FF6B00] mb-2 uppercase italic tracking-tighter">Novo Acesso!</h2>
                        <p className="text-zinc-500 mb-6 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                            Este é seu PIN de segurança.<br />Use-o para entrar em outros dispositivos.
                        </p>

                        <div className="bg-[#121212] border-2 border-[#FF6B00] rounded-2xl p-6 mb-8 relative">
                            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#FF6B00] to-transparent opacity-50"></div>
                            <p className="text-6xl font-black text-white tracking-[0.5em] ml-4 drop-shadow-[0_0_15px_rgba(255,107,0,0.5)]">{generatedPin}</p>
                        </div>

                        <div className="flex flex-col space-y-3">
                            <button
                                onClick={handleRegistrationConfirm}
                                disabled={loading}
                                className="w-full py-5 bg-[#FF6B00] text-[#121212] rounded-xl font-black text-lg uppercase italic tracking-wider active:scale-95 transition-all"
                            >
                                {loading ? 'Criando...' : 'Entendi, Salvar PIN'}
                            </button>
                            <button onClick={() => setStep('NAME')} className="text-zinc-600 text-xs font-bold uppercase hover:text-white">Voltar</button>
                        </div>
                    </>
                )}

                {step === 'LOGIN' && (
                    <>
                        <h2 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tighter">Olá, {name}!</h2>
                        <p className="text-zinc-600 mb-8 text-[10px] font-black uppercase tracking-[0.2em]">Digite seu PIN para entrar</p>

                        <form onSubmit={handleLogin} className="w-full space-y-6">
                            <input
                                type="text"
                                maxLength={4}
                                value={loginPin}
                                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ''))}
                                placeholder="0000"
                                className="w-full bg-[#121212] text-white text-center py-4 rounded-xl border border-[#333] focus:border-[#FF6B00] outline-none font-black text-4xl tracking-[0.5em] placeholder-zinc-800"
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={loginPin.length < 4 || loading}
                                className="w-full py-5 bg-[#FF6B00] text-[#121212] rounded-xl font-black text-lg uppercase italic tracking-wider active:scale-95 disabled:opacity-50 transition-all"
                            >
                                {loading ? 'Entrando...' : 'Acessar Conta'}
                            </button>
                            {error && <p className="text-red-500 text-xs font-bold uppercase">{error}</p>}
                            <button type="button" onClick={() => setStep('NAME')} className="text-zinc-600 text-xs font-bold uppercase hover:text-white">Não sou {name}</button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};

export default UserRegistration;
