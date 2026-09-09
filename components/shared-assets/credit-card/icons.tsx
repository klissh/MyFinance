"use client";

import type { SVGProps } from "react";
import type { CardNetwork } from "@/lib/card-networks";

type NetworkIconProps = SVGProps<SVGSVGElement> & { variant?: "light" | "dark" };

export const PaypassIcon = (props: SVGProps<SVGSVGElement>) => {
    return (
        <svg width="20" height="24" viewBox="0 0 20 24" fill="none" {...props}>
            <g clipPath="url(#clip0_1307_7682)">
                <path
                    d="M15.1429 1.28571C17.0236 4.54326 18.0138 8.23849 18.0138 12C18.0138 15.7615 17.0236 19.4567 15.1429 22.7143M10.4286 3.64285C11.8956 6.18374 12.6679 9.06602 12.6679 12C12.6679 14.934 11.8956 17.8162 10.4286 20.3571M5.92859 5.80713C6.98933 7.66394 7.54777 9.77022 7.54777 11.9143C7.54777 14.0583 6.98933 16.1646 5.92859 18.0214M1.42859 8.14285C2.19306 9.29983 2.59834 10.6362 2.59834 12C2.59834 13.3638 2.19306 14.7002 1.42859 15.8571"
                    stroke="currentColor"
                    strokeWidth="2.57143"
                    strokeLinecap="round"
                />
            </g>
            <defs>
                <clipPath id="clip0_1307_7682">
                    <rect width="20" height="24" fill="white" />
                </clipPath>
            </defs>
        </svg>
    );
};

export const MastercardIconWhite = (props: SVGProps<SVGSVGElement>) => {
    return (
        <svg width="30" height="19" viewBox="0 0 30 19" fill="none" {...props}>
            <path
                opacity="0.5"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M14.9053 16.4392C13.3266 17.7699 11.2787 18.5733 9.04092 18.5733C4.04776 18.5733 0 14.5737 0 9.63994C0 4.70619 4.04776 0.706604 9.04092 0.706604C11.2787 0.706604 13.3266 1.50993 14.9053 2.84066C16.484 1.50993 18.5319 0.706604 20.7697 0.706604C25.7629 0.706604 29.8106 4.70619 29.8106 9.63994C29.8106 14.5737 25.7629 18.5733 20.7697 18.5733C18.5319 18.5733 16.484 17.7699 14.9053 16.4392Z"
                fill="white"
            />
            <path
                opacity="0.5"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M14.9053 16.4392C16.8492 14.8007 18.0818 12.3625 18.0818 9.63994C18.0818 6.91733 16.8492 4.47919 14.9053 2.84066C16.484 1.50993 18.5319 0.706604 20.7697 0.706604C25.7628 0.706604 29.8106 4.70619 29.8106 9.63994C29.8106 14.5737 25.7628 18.5733 20.7697 18.5733C18.5319 18.5733 16.484 17.7699 14.9053 16.4392Z"
                fill="white"
            />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M14.9053 16.4392C16.8492 14.8007 18.0818 12.3625 18.0818 9.63995C18.0818 6.91736 16.8492 4.47924 14.9053 2.8407C12.9614 4.47924 11.7288 6.91736 11.7288 9.63995C11.7288 12.3625 12.9614 14.8007 14.9053 16.4392Z"
                fill="white"
            />
        </svg>
    );
};

export const MastercardIcon = (props: SVGProps<SVGSVGElement>) => {
    return (
        <svg width="30" height="19" viewBox="0 0 30 19" fill="none" {...props}>
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M14.9053 16.4393C13.3266 17.77 11.2787 18.5733 9.04092 18.5733C4.04776 18.5733 0 14.5737 0 9.64C0 4.70625 4.04776 0.706665 9.04092 0.706665C11.2787 0.706665 13.3266 1.51 14.9053 2.84072C16.484 1.51 18.5319 0.706665 20.7697 0.706665C25.7629 0.706665 29.8106 4.70625 29.8106 9.64C29.8106 14.5737 25.7629 18.5733 20.7697 18.5733C18.5319 18.5733 16.484 17.77 14.9053 16.4393Z"
                fill="#ED0006"
            />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M14.9053 16.4393C16.8492 14.8007 18.0818 12.3626 18.0818 9.64C18.0818 6.91739 16.8492 4.47925 14.9053 2.84072C16.484 1.50999 18.5319 0.706665 20.7697 0.706665C25.7628 0.706665 29.8106 4.70625 29.8106 9.64C29.8106 14.5737 25.7628 18.5733 20.7697 18.5733C18.5319 18.5733 16.484 17.77 14.9053 16.4393Z"
                fill="#F9A000"
            />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M14.9053 16.4393C16.8492 14.8008 18.0818 12.3627 18.0818 9.64007C18.0818 6.91748 16.8492 4.47936 14.9053 2.84082C12.9614 4.47936 11.7288 6.91748 11.7288 9.64007C11.7288 12.3627 12.9614 14.8008 14.9053 16.4393Z"
                fill="#FF5E00"
            />
        </svg>
    );
};

// ── Jaringan / jenis kartu ────────────────────────────────────────────────────
// Tanda merek sederhana (bentuk geometris / teks), bukan reproduksi logo asli.

const SANS = "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";

export const VisaIcon = ({ variant = "dark", ...props }: NetworkIconProps) => (
    <svg width="38" height="14" viewBox="0 0 48 18" fill="none" {...props}>
        <text
            x="24"
            y="15"
            textAnchor="middle"
            fontFamily={SANS}
            fontSize="17"
            fontWeight="800"
            fontStyle="italic"
            letterSpacing="1"
            fill={variant === "light" ? "#1434CB" : "#ffffff"}
        >
            VISA
        </text>
    </svg>
);

export const AmexIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg width="33" height="20" viewBox="0 0 44 26" fill="none" {...props}>
        <rect width="44" height="26" rx="3.5" fill="#1F72CD" />
        <text
            x="22"
            y="17.5"
            textAnchor="middle"
            fontFamily={SANS}
            fontSize="10"
            fontWeight="800"
            letterSpacing="1"
            fill="#ffffff"
        >
            AMEX
        </text>
    </svg>
);

export const UnionPayIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg width="33" height="19" viewBox="0 0 46 26" fill="none" {...props}>
        <path d="M4 0h13a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z" fill="#E21836" />
        <rect x="16.5" width="13" height="26" fill="#00447C" />
        <path d="M29 0h13a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H29a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z" fill="#007B84" />
        <text
            x="23"
            y="17"
            textAnchor="middle"
            fontFamily={SANS}
            fontSize="9"
            fontWeight="800"
            fill="#ffffff"
        >
            UP
        </text>
    </svg>
);

export const JcbIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg width="33" height="19" viewBox="0 0 46 26" fill="none" {...props}>
        {[
            { x: 0, fill: "#0F4C97", label: "J" },
            { x: 16, fill: "#BE0027", label: "C" },
            { x: 32, fill: "#1C7B3F", label: "B" },
        ].map((seg) => (
            <g key={seg.label}>
                <rect x={seg.x} width="14" height="26" rx="3" fill={seg.fill} />
                <text
                    x={seg.x + 7}
                    y="17.5"
                    textAnchor="middle"
                    fontFamily={SANS}
                    fontSize="10"
                    fontWeight="800"
                    fill="#ffffff"
                >
                    {seg.label}
                </text>
            </g>
        ))}
    </svg>
);

export const GenericCardIcon = ({ variant = "dark", ...props }: NetworkIconProps) => {
    const stroke = variant === "light" ? "#0f172a" : "#ffffff";
    return (
        <svg width="28" height="20" viewBox="0 0 34 24" fill="none" {...props}>
            <rect x="1.25" y="1.25" width="31.5" height="21.5" rx="3.5" stroke={stroke} strokeOpacity="0.75" strokeWidth="1.5" />
            <path d="M10 1.5v21M24 1.5v21M1.5 8.5h31M1.5 15.5h31" stroke={stroke} strokeOpacity="0.35" strokeWidth="1" />
        </svg>
    );
};

/** Logo jaringan kartu untuk pojok kanan-bawah kartu. `variant` = tema kartu
 *  ("dark" → logo terang, "light" → logo gelap). Mengembalikan null utk "none". */
export const NetworkLogo = ({
    network,
    variant,
    className,
}: {
    network: CardNetwork;
    variant: "light" | "dark";
    className?: string;
}) => {
    switch (network) {
        case "visa":
            return <VisaIcon variant={variant} className={className} />;
        case "mastercard":
            return variant === "light" ? (
                <MastercardIcon className={className} />
            ) : (
                <MastercardIconWhite className={className} />
            );
        case "amex":
            return <AmexIcon className={className} />;
        case "unionpay":
            return <UnionPayIcon className={className} />;
        case "jcb":
            return <JcbIcon className={className} />;
        case "other":
            return <GenericCardIcon variant={variant} className={className} />;
        case "none":
        default:
            return null;
    }
};
