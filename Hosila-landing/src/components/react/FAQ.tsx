import React, { useState } from 'react';

const frequentlyAskedQuestions = [
    {
        question: "How long does setup take?",
        answer: "Most hotels are running within a day. We handle the heavy lifting and your team learns as you go. No lengthy implementation, no consultants sitting in your office for weeks."
    },
    {
        question: "Can we import our existing data?",
        answer: "Yes. We bring your guest history, inventory records, and past transactions into Hosila cleanly. Your data moves with you, nothing gets left behind."
    },
    {
        question: "What if we use multiple locations?",
        answer: "Hosila handles multi-property operations. Manage each location separately or see everything together. The choice is yours and it scales with your business."
    },
    {
        question: "Does it work offline?",
        answer: "Your critical operations keep running even without internet. Data syncs automatically when you're back online. No lost bookings, no missed orders."
    },
    {
        question: "What about customer support?",
        answer: "We're here when you need us. Email, chat, or phone support depending on your plan. Enterprise customers get a dedicated contact who knows your operation."
    }
];

export default function FAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <div className="flex flex-col gap-4">
            {frequentlyAskedQuestions.map((faq, index) => {
                const isOpen = openIndex === index;
                return (
                    <div
                        key={index}
                        className="border border-border-strong rounded-2xl overflow-hidden bg-surface-base transition-colors hover:border-brand-300"
                    >
                        <button
                            onClick={() => setOpenIndex(isOpen ? null : index)}
                            className="w-full flex items-center justify-between p-6 text-left"
                        >
                            <h3 className="mb-0">
                                {faq.question}
                            </h3>
                            <div className="text-brand-500 flex-shrink-0">
                                {isOpen ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                )}
                            </div>
                        </button>
                        <div
                            className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                                }`}
                        >
                            <p className="px-6 pb-6 mb-0">
                                {faq.answer}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
