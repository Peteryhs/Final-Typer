import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Stack, Button,
    Slider, Switch, Collapse, Divider
} from '@mui/material';
import {
    AccessTime, ErrorOutline,
    Science, ExpandLess, ExpandMore, PlayArrow, Pause,
    Speed, Psychology, Create, Refresh
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import type { TypingAdvancedSettings } from '../lib/typing/types';

interface ConfigPanelProps {
    speed: number;
    setSpeed: (speed: number) => void;
    speedMode: 'constant' | 'dynamic';
    setSpeedMode: (mode: 'constant' | 'dynamic') => void;
    speedVariance: number;
    setSpeedVariance: (variance: number) => void;
    mistakeRatePercent: number;
    setMistakeRatePercent: (rate: number) => void;
    fatigueMode: boolean;
    setFatigueMode: (mode: boolean) => void;
    keyboardGateEnabled: boolean;
    setKeyboardGateEnabled: (enabled: boolean) => void;
    showAdvanced: boolean;
    setShowAdvanced: (show: boolean) => void;
    advanced: TypingAdvancedSettings;
    setAdvanced: React.Dispatch<React.SetStateAction<TypingAdvancedSettings>>;
    handleStart: () => void;
    handlePauseResume: () => void;
    text: string;
    isTyping: boolean;
    isPaused: boolean;
    stats: { word_count: number; character_count: number } | null;
    estimatedTimeStr: string;
}

// Reusable slider component for cleaner code
interface SettingSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    format?: (value: number) => string;
    description?: string;
}

function roundToStep(value: number, step: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    const inv = 1 / step;
    return Math.round(value * inv) / inv;
}

function SettingSlider({ label, value, min, max, step, onChange, format, description }: SettingSliderProps) {
    const [display, setDisplay] = useState(value);

    useEffect(() => {
        setDisplay(value);
    }, [value]);

    const displayValue = format ? format(display) : display.toString();
    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="caption" fontFamily="monospace">{displayValue}</Typography>
            </Stack>
            <Slider
                size="small"
                key={value}
                defaultValue={value}
                min={min}
                max={max}
                step={step}
                onChange={(_, v) => {
                    setDisplay(roundToStep(v as number, step));
                }}
                onChangeCommitted={(_, v) => {
                    const next = roundToStep(v as number, step);
                    setDisplay(next);
                    onChange(next);
                }}
                sx={{ height: 3, py: 0 }}
            />
            {description && (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block', mt: 0.5 }}>
                    {description}
                </Typography>
            )}
        </Box>
    );
}

// Reusable toggle component
interface SettingToggleProps {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

function SettingToggle({ label, description, checked, onChange }: SettingToggleProps) {
    return (
        <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
                <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                {description && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                        {description}
                    </Typography>
                )}
            </Box>
            <Switch
                size="small"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
        </Stack>
    );
}

// Collapsible section component with cool styling
interface CollapsibleSectionProps {
    icon: React.ElementType;
    title: string;
    subtitle?: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

function CollapsibleSection({ icon: Icon, title, subtitle, isOpen, onToggle, children }: CollapsibleSectionProps) {
    return (
        <Box>
            <Button
                fullWidth
                onClick={onToggle}
                sx={{
                    justifyContent: 'space-between',
                    py: 1,
                    px: 1.5,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                    textTransform: 'none',
                }}
            >
                <Stack direction="row" spacing={1} alignItems="center">
                    <Icon sx={{ fontSize: '1rem', color: 'primary.main' }} />
                    <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="caption" fontWeight={700} color="text.primary" sx={{
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            fontSize: '0.7rem',
                            display: 'block'
                        }}>
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Stack>
                {isOpen ? <ExpandLess sx={{ fontSize: '1rem', color: 'text.secondary' }} /> : <ExpandMore sx={{ fontSize: '1rem', color: 'text.secondary' }} />}
            </Button>
            <Collapse in={isOpen}>
                <Box sx={{ pt: 1.5, pb: 0.5, px: 0.5 }}>
                    <Stack spacing={1.5}>
                        {children}
                    </Stack>
                </Box>
            </Collapse>
        </Box>
    );
}

export default function ConfigPanel(props: ConfigPanelProps) {
    const {
        speed, setSpeed,
        speedMode, setSpeedMode,
        speedVariance, setSpeedVariance,
        mistakeRatePercent, setMistakeRatePercent,
        setFatigueMode, // Not used directly in this component
        keyboardGateEnabled, setKeyboardGateEnabled,
        showAdvanced, setShowAdvanced,
        advanced, setAdvanced,
        handleStart, handlePauseResume, text, isTyping, isPaused,
        stats, estimatedTimeStr
    } = props;

    const setA = <K extends keyof TypingAdvancedSettings>(key: K, value: TypingAdvancedSettings[K]) => {
        setAdvanced((prev) => ({ ...prev, [key]: value }));
    };

    const [width, setWidth] = useState(420);
    const [isDragging, setIsDragging] = useState(false);
    const [humanizationDisplay, setHumanizationDisplay] = useState(mistakeRatePercent);
    const [speedDisplay, setSpeedDisplay] = useState(speed);
    const [speedVarianceDisplay, setSpeedVarianceDisplay] = useState(speedVariance);

    useEffect(() => {
        setHumanizationDisplay(mistakeRatePercent);
    }, [mistakeRatePercent]);

    useEffect(() => {
        setSpeedDisplay(speed);
    }, [speed]);

    useEffect(() => {
        setSpeedVarianceDisplay(speedVariance);
    }, [speedVariance]);

    // Track which advanced sections are expanded
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        rhythm: false,
        hyperdrive: false,
        chaos: false,
        recovery: false,
        hindsight: false,
        wordswap: false,
    });

    const toggleSection = (key: string) => {
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const newWidth = window.innerWidth - e.clientX;
            setWidth(Math.max(300, Math.min(newWidth, 800)));
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    return (
        <Box
            sx={{
                width: width,
                minWidth: 300,
                height: '100%',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transition: isDragging ? 'none' : 'width 0.2s ease',
                p: 3,
                gap: 3
            }}
        >
            {/* Drag Handle */}
            <Box
                onMouseDown={handleMouseDown}
                sx={{
                    position: 'absolute',
                    left: -4,
                    top: 0,
                    bottom: 0,
                    width: 9,
                    cursor: 'ew-resize',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '&:hover .handle-bar': { bgcolor: 'primary.main', opacity: 1 },
                    '&:active .handle-bar': { bgcolor: 'primary.main', opacity: 1 }
                }}
            >
                <Box
                    className="handle-bar"
                    sx={{
                        width: 4,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: 'text.secondary',
                        opacity: 0,
                        transition: 'all 0.2s'
                    }}
                />
            </Box>

            {/* Top Section: Settings Panel */}
            <Paper
                elevation={0}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: 'background.paper',
                    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))',
                    border: '1px solid rgba(255,255,255,0.05)',
                }}
            >
                <Box sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    '&::-webkit-scrollbar': { display: 'none' },
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                }}>
                    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 600 }}>
                                Parameters
                            </Typography>
                        </Box>

                        <Stack
                            component={motion.div}
                            variants={{
                                hidden: { opacity: 0 },
                                show: { opacity: 1, transition: { staggerChildren: 0.1 } }
                            }}
                            initial="hidden"
                            animate="show"
                            spacing={1.5}
                        >
                            <Paper
                                elevation={0}
                                sx={{
                                    p: 1.5,
                                    bgcolor: 'rgba(255,255,255,0.03)',
                                    borderRadius: 1.5,
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    display: 'flex', flexDirection: 'column', gap: 1.5
                                }}
                            >
                                <Box>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                                        <Typography variant="body2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <AccessTime sx={{ fontSize: '1rem' }} color={speedMode === 'constant' ? 'primary' : 'secondary'} />
                                            Target Speed
                                        </Typography>
                                        <Box sx={{
                                            bgcolor: speedMode === 'constant' ? 'primary.main' : 'secondary.main',
                                            color: 'primary.contrastText',
                                            px: 1.5, py: 0.25,
                                            borderRadius: 100,
                                            fontSize: '0.75rem',
                                            fontWeight: 700
                                        }}>
                                            {Math.round(speedDisplay)} WPM
                                        </Box>
                                    </Stack>
                                    <Slider
                                        key={speed}
                                        defaultValue={speed}
                                        min={10} max={200} step={1}
                                        onChange={(_, v) => setSpeedDisplay(v as number)}
                                        onChangeCommitted={(_, v) => {
                                            const next = Math.round(v as number);
                                            setSpeedDisplay(next);
                                            setSpeed(next);
                                        }}
                                        valueLabelDisplay="auto"
                                        size="small"
                                        sx={{ color: speedMode === 'constant' ? 'primary.main' : 'secondary.main', height: 3, py: 0 }}
                                    />
                                </Box>

                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                                <Box>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="body2" fontWeight={600}>Natural Variation</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Simulate human speed drift</Typography>
                                        </Box>
                                        <Switch
                                            size="small"
                                            checked={speedMode === 'dynamic'}
                                            onChange={(e) => {
                                                setSpeedMode(e.target.checked ? 'dynamic' : 'constant');
                                                if (e.target.checked) setFatigueMode(false);
                                                else setFatigueMode(true);
                                            }}
                                        />
                                    </Stack>

                                    <Collapse in={speedMode === 'dynamic'}>
                                        <Box sx={{ mt: 1, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1 }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Variance Intensity</Typography>
                                                <Typography variant="caption" fontFamily="monospace" fontWeight={700}>+/- {Math.round(speedVarianceDisplay * 100)}%</Typography>
                                            </Stack>
                                            <Slider
                                                key={speedVariance}
                                                defaultValue={speedVariance}
                                                min={0} max={0.5} step={0.05}
                                                onChange={(_, v) => setSpeedVarianceDisplay(roundToStep(v as number, 0.05))}
                                                onChangeCommitted={(_, v) => {
                                                    const next = roundToStep(v as number, 0.05);
                                                    setSpeedVarianceDisplay(next);
                                                    setSpeedVariance(next);
                                                }}
                                                size="small"
                                                sx={{ color: 'secondary.light', height: 3, py: 0 }}
                                            />
                                        </Box>
                                    </Collapse>
                                </Box>

                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                                <Box>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="body2" fontWeight={600}>Type While Keys Active</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                                Types only during live keyboard activity
                                            </Typography>
                                        </Box>
                                        <Switch
                                            size="small"
                                            checked={keyboardGateEnabled}
                                            onChange={(e) => setKeyboardGateEnabled(e.target.checked)}
                                        />
                                    </Stack>
                                </Box>
                            </Paper>

                            {/* Error Rate Card */}
                            <Paper
                                elevation={0}
                                sx={{
                                    p: 1.5,
                                    bgcolor: 'rgba(255,255,255,0.03)',
                                    borderRadius: 1.5,
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                                    <Typography variant="body2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <ErrorOutline sx={{ fontSize: '1rem' }} color="warning" /> Humanization Rate
                                    </Typography>
                                    <Box sx={{
                                        bgcolor: 'warning.main',
                                        color: '#3E2D16',
                                        px: 1.5, py: 0.25,
                                        borderRadius: 100,
                                        fontSize: '0.75rem',
                                        fontWeight: 700
                                    }}>
                                        {humanizationDisplay.toFixed(1)}%
                                    </Box>
                                </Stack>
                                <Slider
                                    key={mistakeRatePercent}
                                    defaultValue={mistakeRatePercent}
                                    min={0} max={10} step={0.1}
                                    onChange={(_, v) => {
                                        setHumanizationDisplay(roundToStep(v as number, 0.1));
                                    }}
                                    onChangeCommitted={(_, v) => {
                                        const next = roundToStep(v as number, 0.1);
                                        setHumanizationDisplay(next);
                                        setMistakeRatePercent(next);
                                    }}
                                    size="small"
                                    sx={{ color: 'warning.main', height: 3, py: 0 }}
                                />
                            </Paper>

                            {/* Advanced Controls Accordion */}
                            <Box>
                                <Button
                                    fullWidth
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    endIcon={showAdvanced ? <ExpandLess sx={{ fontSize: '1rem' }} /> : <ExpandMore sx={{ fontSize: '1rem' }} />}
                                    startIcon={<Science sx={{ fontSize: '1rem' }} />}
                                    sx={{
                                        justifyContent: 'space-between',
                                        color: 'text.secondary',
                                        bgcolor: 'rgba(255,255,255,0.03)',
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                                        textTransform: 'none',
                                        borderRadius: 1.5,
                                        py: 0.75,
                                        px: 1.5,
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    Advanced Behavior
                                </Button>

                                <Collapse in={showAdvanced}>
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            mt: 1,
                                            p: 1.5,
                                            bgcolor: 'rgba(0,0,0,0.2)',
                                            borderRadius: 1.5,
                                            display: 'flex', flexDirection: 'column', gap: 1
                                        }}
                                    >
                                        {/* FLOW & RHYTHM */}
                                        <CollapsibleSection
                                            icon={Speed}
                                            title="Flow & Rhythm"
                                            subtitle="Timing and natural variation"
                                            isOpen={openSections.rhythm}
                                            onToggle={() => toggleSection('rhythm')}
                                        >
                                            <SettingSlider
                                                label="Keystrokes per Word"
                                                value={advanced.keystrokesPerWord}
                                                min={4} max={7} step={1}
                                                onChange={(v) => setA('keystrokesPerWord', v)}
                                                description="Standard WPM uses 5 chars/word"
                                            />
                                            <SettingSlider
                                                label="Delay Variance"
                                                value={advanced.lognormalSigma}
                                                min={0.05} max={0.6} step={0.01}
                                                onChange={(v) => setA('lognormalSigma', v)}
                                                description="Higher = more random timing between keys"
                                            />
                                            <SettingSlider
                                                label="Pause Multiplier"
                                                value={advanced.pauseScale}
                                                min={0.5} max={2.0} step={0.1}
                                                onChange={(v) => setA('pauseScale', v)}
                                                format={(v) => `x${v}`}
                                            />
                                        </CollapsibleSection>

                                        {/* HYPERDRIVE */}
                                        <CollapsibleSection
                                            icon={Speed}
                                            title="Hyperdrive"
                                            subtitle="Speed bursts and momentum"
                                            isOpen={openSections.hyperdrive}
                                            onToggle={() => toggleSection('hyperdrive')}
                                        >
                                            <SettingToggle
                                                label="Enable Bursts"
                                                description="Speeds up in short bursts, then pauses"
                                                checked={advanced.burstEnabled}
                                                onChange={(v) => setA('burstEnabled', v)}
                                            />
                                            <SettingSlider
                                                label="Burst Length (words)"
                                                value={advanced.burstWordsMax}
                                                min={1} max={10} step={1}
                                                onChange={(v) => {
                                                    setA('burstWordsMin', v);
                                                    setA('burstWordsMax', v);
                                                }}
                                            />
                                            <SettingSlider
                                                label="Burst Speed Boost"
                                                value={advanced.burstSpeedMultiplier}
                                                min={1.0} max={1.5} step={0.01}
                                                onChange={(v) => setA('burstSpeedMultiplier', v)}
                                                format={(v) => `x${v}`}
                                            />
                                        </CollapsibleSection>

                                        {/* CHAOS ENGINE */}
                                        <CollapsibleSection
                                            icon={Create}
                                            title="Chaos Engine"
                                            subtitle="Controlled imperfection"
                                            isOpen={openSections.chaos}
                                            onToggle={() => toggleSection('chaos')}
                                        >
                                            <SettingToggle
                                                label="Dynamic Mistakes"
                                                description="Error rate scales with text complexity"
                                                checked={advanced.dynamicMistakes}
                                                onChange={(v) => setA('dynamicMistakes', v)}
                                            />
                                            <SettingToggle
                                                label="Case-Sensitive Typos"
                                                description="Typos match original capitalization"
                                                checked={advanced.caseSensitiveTypos}
                                                onChange={(v) => setA('caseSensitiveTypos', v)}
                                            />
                                        </CollapsibleSection>

                                        {/* RECOVERY PROTOCOL */}
                                        <CollapsibleSection
                                            icon={Refresh}
                                            title="Recovery Protocol"
                                            subtitle="Error detection and correction"
                                            isOpen={openSections.recovery}
                                            onToggle={() => toggleSection('recovery')}
                                        >
                                            <SettingSlider
                                                label="Instant Correction %"
                                                value={advanced.reflexRate}
                                                min={0} max={0.5} step={0.01}
                                                onChange={(v) => setA('reflexRate', v)}
                                                format={(v) => `${Math.round(v * 100)}%`}
                                                description="Chance to immediately correct a typo"
                                            />
                                            <SettingSlider
                                                label="Backspace Delay"
                                                value={advanced.backspaceDelaySeconds}
                                                min={0.0001} max={0.002} step={0.0001}
                                                onChange={(v) => setA('backspaceDelaySeconds', v)}
                                                format={(v) => `${(v * 1000).toFixed(1)}ms`}
                                            />
                                            <SettingSlider
                                                label="Backtrack Chance"
                                                value={advanced.deletionBacktrackChance}
                                                min={0} max={1} step={0.05}
                                                onChange={(v) => setA('deletionBacktrackChance', v)}
                                                format={(v) => `${Math.round(v * 100)}%`}
                                                description="Chance to delete-and-retype vs deferred fix"
                                            />
                                        </CollapsibleSection>

                                        {/* HINDSIGHT MODE */}
                                        <CollapsibleSection
                                            icon={Psychology}
                                            title="Hindsight Mode"
                                            subtitle="Go back and fix old mistakes"
                                            isOpen={openSections.hindsight}
                                            onToggle={() => toggleSection('hindsight')}
                                        >
                                            <SettingToggle
                                                label="Enable Hindsight"
                                                description="Periodically revisit and correct past errors"
                                                checked={advanced.fixSessionsEnabled}
                                                onChange={(v) => setA('fixSessionsEnabled', v)}
                                            />
                                            <SettingSlider
                                                label="Review Interval (words)"
                                                value={advanced.fixSessionIntervalWords}
                                                min={2} max={60} step={1}
                                                onChange={(v) => setA('fixSessionIntervalWords', v)}
                                                description="Words typed before looking back"
                                            />
                                            <SettingSlider
                                                label="Cursor Speed"
                                                value={advanced.fixSessionCursorMoveDelaySeconds}
                                                min={0.0001} max={0.002} step={0.0001}
                                                onChange={(v) => setA('fixSessionCursorMoveDelaySeconds', v)}
                                                format={(v) => `${(v * 1000).toFixed(1)}ms`}
                                                description="Lower = faster, higher = more reliable"
                                            />
                                        </CollapsibleSection>

                                        {/* WORD SWAP */}
                                        <CollapsibleSection
                                            icon={Create}
                                            title="Word Swap"
                                            subtitle="Synonym substitution simulation"
                                            isOpen={openSections.wordswap}
                                            onToggle={() => toggleSection('wordswap')}
                                        >
                                            <SettingToggle
                                                label="Enable Word Swap"
                                                description="Type a synonym, then correct it"
                                                checked={advanced.synonymReplaceEnabled}
                                                onChange={(v) => setA('synonymReplaceEnabled', v)}
                                            />
                                            <SettingSlider
                                                label="Swap Chance"
                                                value={advanced.synonymReplaceChance}
                                                min={0} max={0.25} step={0.01}
                                                onChange={(v) => setA('synonymReplaceChance', v)}
                                                format={(v) => `${Math.round(v * 100)}%`}
                                            />
                                            <SettingToggle
                                                label="Instant Fix"
                                                description="Correct immediately vs later"
                                                checked={advanced.synonymCorrectionMode === 'live'}
                                                onChange={(v) => setA('synonymCorrectionMode', v ? 'live' : 'backtrack')}
                                            />
                                        </CollapsibleSection>

                                    </Paper>
                                </Collapse>
                            </Box>
                        </Stack>
                    </Box>
                </Box>
            </Paper>

            {/* Footer with Stats and Start Button */}
            <Paper
                elevation={4}
                sx={{
                    flexShrink: 0,
                    p: 1.5,
                    bgcolor: 'rgba(30, 30, 35, 0.9)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                }}
            >
                {/* Stats Row */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5} sx={{ px: 0.5 }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem', letterSpacing: 1 }}>WORDS</Typography>
                        <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ fontSize: '0.9rem' }}>
                            {stats?.word_count || 0}
                        </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem', letterSpacing: 1 }}>CHARS</Typography>
                        <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ fontSize: '0.9rem' }}>
                            {stats?.character_count || 0}
                        </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem', letterSpacing: 1 }}>TIME</Typography>
                        <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ fontSize: '0.9rem' }}>
                            {estimatedTimeStr}
                        </Typography>
                    </Box>
                </Stack>

                {isTyping ? (
                    <Button
                        component={motion.button}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        fullWidth
                        variant="contained"
                        color={isPaused ? "success" : "warning"}
                        onClick={handlePauseResume}
                        startIcon={isPaused ? <PlayArrow sx={{ fontSize: '1rem' }} /> : <Pause sx={{ fontSize: '1rem' }} />}
                        sx={{
                            py: 1,
                            fontSize: '0.85rem',
                            borderRadius: 2,
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(var(--mui-palette-primary-mainChannel), 0.4)'
                        }}
                    >
                        {isPaused ? "Resume" : "Pause"}
                    </Button>
                ) : (
                    <Button
                        component={motion.button}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        fullWidth
                        variant="contained"
                        color="primary"
                        onClick={handleStart}
                        disabled={!text}
                        startIcon={<PlayArrow sx={{ fontSize: '1rem' }} />}
                        sx={{
                            py: 1,
                            fontSize: '0.85rem',
                            borderRadius: 2,
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(var(--mui-palette-primary-mainChannel), 0.4)'
                        }}
                    >
                        Start Engine
                    </Button>
                )}
            </Paper>
        </Box >
    );
}
