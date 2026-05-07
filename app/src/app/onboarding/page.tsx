"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DAY_OPTIONS,
  DEFAULT_PROFILE,
  ENVIRONMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  formatEnvironment,
  formatExperience,
  formatGoal,
  loadTrainingProfile,
  saveTrainingProfile,
  useTrainingProfile,
} from "@/lib/profile";
import type { TrainingProfile } from "@/lib/types";

export default function OnboardingPage() {
  const router = useRouter();
  const { profile, ready } = useTrainingProfile();
  const [draft, setDraft] = useState<TrainingProfile>(
    () => loadTrainingProfile() ?? profile ?? DEFAULT_PROFILE,
  );

  const save = () => {
    saveTrainingProfile(draft);
    router.push("/next");
  };

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-20 pt-6">
      <div className="mb-3">
        <Link href="/" className="text-[13px] font-medium text-text-muted">
          ← Back
        </Link>
      </div>

      <header className="mb-6">
        <p className="label-eyebrow">Setup</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-text">
          Training profile
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-text-subtle">
          Tell the planner what kind of training you want and what equipment you
          actually have. This is the first layer before weekly split logic.
        </p>
      </header>

      {!ready && (
        <div className="rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-5 text-[13px] text-text-subtle">
          Loading…
        </div>
      )}

      {ready && (
        <>
          <section className="space-y-5 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
            <Question
              label="Goal"
              options={GOAL_OPTIONS.map((value) => ({
                value,
                text: formatGoal(value),
              }))}
              selected={draft.goal}
              onSelect={(goal) => setDraft((prev) => ({ ...prev, goal }))}
            />

            <Question
              label="Training days"
              options={DAY_OPTIONS.map((value) => ({
                value,
                text: `${value} days / week`,
              }))}
              selected={draft.daysPerWeek}
              onSelect={(daysPerWeek) =>
                setDraft((prev) => ({ ...prev, daysPerWeek }))
              }
            />

            <Question
              label="Equipment"
              options={ENVIRONMENT_OPTIONS.map((value) => ({
                value,
                text: formatEnvironment(value),
              }))}
              selected={draft.equipment}
              onSelect={(equipment) =>
                setDraft((prev) => ({ ...prev, equipment }))
              }
            />

            <Question
              label="Experience"
              options={EXPERIENCE_OPTIONS.map((value) => ({
                value,
                text: formatExperience(value),
              }))}
              selected={draft.experience}
              onSelect={(experience) =>
                setDraft((prev) => ({ ...prev, experience }))
              }
            />
          </section>

          <section className="mt-5 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
            <p className="label-eyebrow mb-2">Current profile</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip>{formatGoal(draft.goal)}</Chip>
              <Chip>{draft.daysPerWeek} days/week</Chip>
              <Chip>{formatEnvironment(draft.equipment)}</Chip>
              <Chip>{formatExperience(draft.experience)}</Chip>
            </div>
          </section>

          <div className="mt-6">
            <button
              onClick={save}
              className="w-full rounded-full bg-text py-3 text-[14px] font-medium text-white"
            >
              Save profile
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Question<T extends string | number>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: T; text: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div>
      <p className="label-eyebrow mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <button
              key={String(option.value)}
              onClick={() => onSelect(option.value)}
              className={`rounded-xl border px-3 py-3 text-left text-[13px] font-medium ${
                active
                  ? "border-text bg-text text-white"
                  : "border-[#E6E3D8] bg-white text-text"
              }`}
            >
              {option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[#F1EFE8] px-3 py-1 text-[12px] font-medium text-text-muted">
      {children}
    </span>
  );
}
