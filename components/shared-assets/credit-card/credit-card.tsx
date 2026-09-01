"use client";

import { useMemo } from "react";
import { cx, sortCx } from "@/lib/utils/cx";
import { MastercardIcon, MastercardIconWhite, PaypassIcon } from "./icons";

const styles = sortCx({
    // Normal
    transparent: {
        root: "bg-zinc-950 bg-gradient-to-br from-zinc-800 to-zinc-950 border border-zinc-700/50 shadow-md",
        company: "text-white font-bold",
        footerText: "text-zinc-200",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },
    "transparent-gradient": {
        root: "bg-slate-950 bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950 border border-indigo-500/30 shadow-md",
        company: "text-white font-bold",
        footerText: "text-white",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },
    "brand-dark": {
        root: "bg-zinc-950 bg-gradient-to-tr from-zinc-950 via-slate-900 to-zinc-900 border border-zinc-800 shadow-md text-white",
        company: "text-white font-bold",
        footerText: "text-zinc-200",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },
    "brand-light": {
        root: "bg-slate-100 bg-gradient-to-tr from-slate-100 to-zinc-200 border border-slate-300 shadow-md text-slate-900",
        company: "text-slate-900 font-bold",
        footerText: "text-slate-800 font-semibold",
        paypassIcon: "text-slate-700",
        cardTypeRoot: "bg-slate-900/10",
    },
    "gray-dark": {
        root: "bg-neutral-950 bg-gradient-to-tr from-neutral-950 via-neutral-900 to-neutral-800 border border-neutral-700/50 shadow-md text-white",
        company: "text-white font-bold",
        footerText: "text-neutral-200",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },
    "gray-light": {
        root: "bg-neutral-100 bg-gradient-to-tr from-neutral-100 to-neutral-200 border border-neutral-300 shadow-md text-neutral-900",
        company: "text-neutral-900 font-bold",
        footerText: "text-neutral-800 font-semibold",
        paypassIcon: "text-neutral-600",
        cardTypeRoot: "bg-neutral-900/10",
    },

    // Strip
    "transparent-strip": {
        root: "bg-zinc-900 bg-gradient-to-br from-zinc-800 to-zinc-950 border border-zinc-700/50 shadow-md text-white",
        company: "text-white font-bold",
        footerText: "text-white",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },
    "gray-strip": {
        root: "bg-neutral-100 border border-neutral-300 shadow-md text-neutral-900",
        company: "text-neutral-900 font-bold",
        footerText: "text-neutral-800",
        paypassIcon: "text-neutral-600",
        cardTypeRoot: "bg-neutral-900/10",
    },
    "gradient-strip": {
        root: "bg-slate-950 bg-gradient-to-b from-[#1e293b] to-[#0f172a] border border-slate-700 shadow-md text-white",
        company: "text-white font-bold",
        footerText: "text-white",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },
    "salmon-strip": {
        root: "bg-rose-950 bg-gradient-to-tr from-rose-950 via-pink-900 to-slate-900 border border-rose-800/40 shadow-md text-white",
        company: "text-white font-bold",
        footerText: "text-rose-100",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },

    // Vertical strip
    "gray-strip-vertical": {
        root: "bg-zinc-950 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 shadow-md text-white",
        company: "text-white font-bold",
        footerText: "text-white",
        paypassIcon: "text-zinc-400",
        cardTypeRoot: "bg-white/10",
    },
    "gradient-strip-vertical": {
        root: "bg-purple-950 bg-gradient-to-b from-purple-950 to-indigo-950 border border-purple-800/40 shadow-md text-white",
        company: "text-white font-bold",
        footerText: "text-white",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },
    "salmon-strip-vertical": {
        root: "bg-rose-950 bg-gradient-to-b from-rose-950 to-slate-950 border border-rose-800/40 shadow-md text-white",
        company: "text-white font-bold",
        footerText: "text-white",
        paypassIcon: "text-white",
        cardTypeRoot: "bg-white/10",
    },
});

const _NORMAL_TYPES = ["transparent", "transparent-gradient", "brand-dark", "brand-light", "gray-dark", "gray-light"] as const;
const STRIP_TYPES = ["transparent-strip", "gray-strip", "gradient-strip", "salmon-strip"] as const;
const VERTICAL_STRIP_TYPES = ["gray-strip-vertical", "gradient-strip-vertical", "salmon-strip-vertical"] as const;

const CARD_WITH_COLOR_LOGO = ["brand-dark", "brand-light", "gray-dark", "gray-light"] as const;

type CreditCardType = (typeof _NORMAL_TYPES)[number] | (typeof STRIP_TYPES)[number] | (typeof VERTICAL_STRIP_TYPES)[number];

interface CreditCardProps {
    company?: string;
    cardNumber?: string;
    cardHolder?: string;
    cardExpiration?: string;
    type?: CreditCardType;
    className?: string;
    width?: number;
}

const calculateScale = (desiredWidth: number, originalWidth: number, originalHeight: number) => {
    const scale = desiredWidth / originalWidth;
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;

    return {
        scale: scale.toFixed(4),
        scaledWidth: scaledWidth.toFixed(2),
        scaledHeight: scaledHeight.toFixed(2),
    };
};

export const CreditCard = ({
    company = "Untitled.",
    cardNumber = "1234 1234 1234 1234",
    cardHolder = "OLIVIA RHYE",
    cardExpiration = "06/28",
    type = "brand-dark",
    className,
    width,
}: CreditCardProps) => {
    const originalWidth = 316;
    const originalHeight = 190;

    const { scale, scaledWidth, scaledHeight } = useMemo(() => {
        if (!width)
            return {
                scale: 1,
                scaledWidth: originalWidth,
                scaledHeight: originalHeight,
            };

        return calculateScale(width, originalWidth, originalHeight);
    }, [width]);

    const activeStyle = styles[type] || styles["brand-dark"];

    return (
        <div
            style={{
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`,
            }}
            className={cx("relative flex", className)}
        >
            <div
                style={{
                    transform: `scale(${scale})`,
                    width: `${originalWidth}px`,
                    height: `${originalHeight}px`,
                }}
                className={cx("absolute top-0 left-0 flex origin-top-left flex-col justify-between overflow-hidden rounded-2xl p-4", activeStyle.root)}
            >
                {/* Horizontal strip */}
                {STRIP_TYPES.includes(type as (typeof STRIP_TYPES)[number]) && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-1/2 bg-neutral-900/60"></div>
                )}
                {/* Vertical stripe */}
                {VERTICAL_STRIP_TYPES.includes(type as (typeof VERTICAL_STRIP_TYPES)[number]) && (
                    <div className="pointer-events-none absolute inset-y-0 right-22 left-0 z-0 bg-neutral-900/60"></div>
                )}
                {/* Gradient diffusor */}
                {type === "transparent-gradient" && (
                    <div className="absolute -top-4 -left-4 grid grid-cols-2 blur-3xl pointer-events-none">
                        <div className="size-20 rounded-tl-full bg-pink-500 opacity-40 mix-blend-normal" />
                        <div className="size-20 rounded-tr-full bg-orange-500 opacity-50 mix-blend-normal" />
                        <div className="size-20 rounded-bl-full bg-blue-500 opacity-40 mix-blend-normal" />
                        <div className="bg-green-500 size-20 rounded-br-full opacity-40 mix-blend-normal" />
                    </div>
                )}

                <div className="relative flex items-start justify-between px-1 pt-1 z-10">
                    <div className={cx("text-md leading-[normal] font-semibold", activeStyle.company)}>{company}</div>
                    <PaypassIcon className={activeStyle.paypassIcon} />
                </div>

                <div className="relative flex items-end justify-between gap-3 z-10">
                    <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex items-end gap-1">
                            <p
                                style={{
                                    wordBreak: "break-word",
                                }}
                                className={cx("text-xs leading-snug font-semibold tracking-[0.6px] uppercase", activeStyle.footerText)}
                            >
                                {cardHolder}
                            </p>
                            <p
                                className={cx(
                                    "ml-auto text-right text-xs leading-[normal] font-semibold tracking-[0.6px] tabular-nums",
                                    activeStyle.footerText,
                                )}
                            >
                                {cardExpiration}
                            </p>
                        </div>
                        <div className={cx("text-md leading-[normal] font-semibold tracking-[1px] tabular-nums", activeStyle.footerText)}>
                            {cardNumber}
                            <span className="pointer-events-none invisible inline-block w-0 max-w-0 opacity-0">1</span>
                        </div>
                    </div>

                    <div className={cx("flex h-8 w-11.5 shrink-0 items-center justify-center rounded", activeStyle.cardTypeRoot)}>
                        {CARD_WITH_COLOR_LOGO.includes(type as (typeof CARD_WITH_COLOR_LOGO)[number]) ? <MastercardIcon /> : <MastercardIconWhite />}
                    </div>
                </div>
            </div>
        </div>
    );
};
