/**
 * SIMPLIFIED Typer.cs - Stripped down for maximum reliability
 * 
 * This version removes all the complexity and focuses on just working.
 * - No complex timing
 * - Simple command parsing
 * - Immediate ACK response
 */

using System;
using System.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public class Typer {
    // Windows API for SendInput
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;
    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;

    // Virtual key codes
    private const ushort VK_BACK = 0x08;
    private const ushort VK_TAB = 0x09;
    private const ushort VK_RETURN = 0x0D;
    private const ushort VK_SHIFT = 0x10;
    private const ushort VK_CONTROL = 0x11;
    private const ushort VK_END = 0x23;
    private const ushort VK_HOME = 0x24;
    private const ushort VK_LEFT = 0x25;
    private const ushort VK_UP = 0x26;
    private const ushort VK_RIGHT = 0x27;
    private const ushort VK_DOWN = 0x28;

    // Global input hook constants
    private const int WH_KEYBOARD_LL = 13;
    private const int WH_MOUSE_LL = 14;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int WM_MOUSEMOVE = 0x0200;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_MBUTTONDOWN = 0x0207;
    private const int WM_MOUSEWHEEL = 0x020A;
    private const int WM_QUIT = 0x0012;

    private const uint LLKHF_INJECTED = 0x00000010;
    private const uint LLKHF_LOWER_IL_INJECTED = 0x00000002;
    private const uint LLMHF_INJECTED = 0x00000001;
    private const uint LLMHF_LOWER_IL_INJECTED = 0x00000002;
    private static readonly IntPtr SYNTHETIC_INPUT_TAG = new IntPtr(unchecked((long)0x46494E414C545950));
    private const int USER_INPUT_DEBOUNCE_MS = 250;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT {
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT {
        public POINT pt;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, Delegate lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern sbyte GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage([In] ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage([In] ref MSG lpmsg);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostThreadMessage(uint idThread, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    private static IntPtr keyboardHook = IntPtr.Zero;
    private static IntPtr mouseHook = IntPtr.Zero;
    private static LowLevelKeyboardProc keyboardProc = KeyboardHookCallback;
    private static LowLevelMouseProc mouseProc = MouseHookCallback;
    private static Thread hookThread;
    private static uint hookThreadId = 0;
    private static long lastUserInputTickMs = 0;
    private static bool blockUserKeyboardInput = false;

    private static void NotifyKeyboardInput() {
        long now = Environment.TickCount64;
        long prev = Interlocked.Read(ref lastUserInputTickMs);
        if (now - prev < USER_INPUT_DEBOUNCE_MS) return;
        Interlocked.Exchange(ref lastUserInputTickMs, now);
        Console.Error.WriteLine("USER_KEYBOARD_INPUT");
    }

    private static IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            int message = wParam.ToInt32();
            if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN || message == WM_KEYUP || message == WM_SYSKEYUP) {
                var info = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
                bool injected =
                    (info.flags & LLKHF_INJECTED) != 0 ||
                    (info.flags & LLKHF_LOWER_IL_INJECTED) != 0 ||
                    info.dwExtraInfo == SYNTHETIC_INPUT_TAG;

                if (!injected && (message == WM_KEYDOWN || message == WM_SYSKEYDOWN)) {
                    NotifyKeyboardInput();
                }

                if (!injected && blockUserKeyboardInput) {
                    return new IntPtr(1);
                }
            }
        }
        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
    }

    private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        return CallNextHookEx(mouseHook, nCode, wParam, lParam);
    }

    private static void HookThreadMain() {
        hookThreadId = GetCurrentThreadId();
        IntPtr hMod = GetModuleHandle(null);

        keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyboardProc, hMod, 0);
        if (keyboardHook == IntPtr.Zero) {
            Console.Error.WriteLine("HOOK_FAIL:KEYBOARD:" + Marshal.GetLastWin32Error());
        }

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }

        if (keyboardHook != IntPtr.Zero) {
            UnhookWindowsHookEx(keyboardHook);
            keyboardHook = IntPtr.Zero;
        }
    }

    private static void StartUserInputMonitor() {
        hookThread = new Thread(HookThreadMain);
        hookThread.IsBackground = true;
        hookThread.Name = "TyperInputHook";
        hookThread.Start();
    }

    private static void StopUserInputMonitor() {
        if (hookThreadId != 0) {
            PostThreadMessage(hookThreadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
        }
        if (hookThread != null && hookThread.IsAlive) {
            hookThread.Join(300);
        }
    }

    // Simple key press with minimal delay
    private static void PressKey(ushort vk, bool extended = false) {
        var input = new INPUT[2];
        
        // Key down
        input[0].type = INPUT_KEYBOARD;
        input[0].u.ki.wVk = vk;
        input[0].u.ki.wScan = 0;
        input[0].u.ki.dwFlags = extended ? KEYEVENTF_EXTENDEDKEY : 0;
        input[0].u.ki.time = 0;
        input[0].u.ki.dwExtraInfo = SYNTHETIC_INPUT_TAG;
        
        // Key up
        input[1].type = INPUT_KEYBOARD;
        input[1].u.ki.wVk = vk;
        input[1].u.ki.wScan = 0;
        input[1].u.ki.dwFlags = KEYEVENTF_KEYUP | (extended ? KEYEVENTF_EXTENDEDKEY : 0);
        input[1].u.ki.time = 0;
        input[1].u.ki.dwExtraInfo = SYNTHETIC_INPUT_TAG;
        
        SendInput(2, input, Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(3); // Minimal pause after key (was 10ms, reduced for high WPM)
    }

    // Send a unicode character
    private static void TypeChar(char c) {
        var input = new INPUT[2];
        
        // Key down
        input[0].type = INPUT_KEYBOARD;
        input[0].u.ki.wVk = 0;
        input[0].u.ki.wScan = (ushort)c;
        input[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
        input[0].u.ki.time = 0;
        input[0].u.ki.dwExtraInfo = SYNTHETIC_INPUT_TAG;
        
        // Key up
        input[1].type = INPUT_KEYBOARD;
        input[1].u.ki.wVk = 0;
        input[1].u.ki.wScan = (ushort)c;
        input[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        input[1].u.ki.time = 0;
        input[1].u.ki.dwExtraInfo = SYNTHETIC_INPUT_TAG;
        
        SendInput(2, input, Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(2); // Minimal pause after char (was 8ms, reduced for high WPM)
    }

    // Hold control and press a key
    private static void CtrlKey(ushort vk, bool extended = false) {
        var input = new INPUT[4];
        
        // Ctrl down
        input[0].type = INPUT_KEYBOARD;
        input[0].u.ki.wVk = VK_CONTROL;
        input[0].u.ki.dwFlags = 0;
        input[0].u.ki.dwExtraInfo = SYNTHETIC_INPUT_TAG;
        
        // Key down
        input[1].type = INPUT_KEYBOARD;
        input[1].u.ki.wVk = vk;
        input[1].u.ki.dwFlags = extended ? KEYEVENTF_EXTENDEDKEY : 0;
        input[1].u.ki.dwExtraInfo = SYNTHETIC_INPUT_TAG;
        
        // Key up
        input[2].type = INPUT_KEYBOARD;
        input[2].u.ki.wVk = vk;
        input[2].u.ki.dwFlags = KEYEVENTF_KEYUP | (extended ? KEYEVENTF_EXTENDEDKEY : 0);
        input[2].u.ki.dwExtraInfo = SYNTHETIC_INPUT_TAG;
        
        // Ctrl up
        input[3].type = INPUT_KEYBOARD;
        input[3].u.ki.wVk = VK_CONTROL;
        input[3].u.ki.dwFlags = KEYEVENTF_KEYUP;
        input[3].u.ki.dwExtraInfo = SYNTHETIC_INPUT_TAG;
        
        SendInput(4, input, Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(5); // Pause after ctrl combo (was 15ms, reduced for high WPM)
    }

    private static void ProcessCommand(string cmd, StreamWriter stdout) {
        try {
            int i = 0;
            while (i < cmd.Length) {
                char c = cmd[i];
                
                if (c == '{') {
                    int end = cmd.IndexOf('}', i);
                    if (end == -1) {
                        // No closing brace, just type the rest
                        for (; i < cmd.Length; i++) TypeChar(cmd[i]);
                        break;
                    }
                    
                    string key = cmd.Substring(i + 1, end - i - 1).ToUpperInvariant();
                    switch (key) {
                        case "BACKSPACE": case "BS": case "BKSP": PressKey(VK_BACK); break;
                        case "ENTER": PressKey(VK_RETURN); break;
                        case "TAB": PressKey(VK_TAB); break;
                        case "LEFT": PressKey(VK_LEFT, true); break;
                        case "RIGHT": PressKey(VK_RIGHT, true); break;
                        case "UP": PressKey(VK_UP, true); break;
                        case "DOWN": PressKey(VK_DOWN, true); break;
                        case "HOME": PressKey(VK_HOME, true); break;
                        case "END": PressKey(VK_END, true); break;
                        case "{": TypeChar('{'); break;
                        case "}": TypeChar('}'); break;
                        case "+": TypeChar('+'); break;
                        case "^": TypeChar('^'); break;
                        case "%": TypeChar('%'); break;
                        case "~": TypeChar('~'); break;
                        case "(": TypeChar('('); break;
                        case ")": TypeChar(')'); break;
                        default:
                            // Unknown, try to type it literally
                            break;
                    }
                    i = end + 1;
                }
                else if (c == '^') {
                    i++;
                    if (i < cmd.Length) {
                        if (cmd[i] == '{') {
                            int end = cmd.IndexOf('}', i);
                            if (end != -1) {
                                string key = cmd.Substring(i + 1, end - i - 1).ToUpperInvariant();
                                switch (key) {
                                    case "END": CtrlKey(VK_END, true); break;
                                    case "HOME": CtrlKey(VK_HOME, true); break;
                                    default: break;
                                }
                                i = end + 1;
                            }
                        } else {
                            // Ctrl+letter
                            char letter = Char.ToUpper(cmd[i]);
                            if (letter >= 'A' && letter <= 'Z') {
                                CtrlKey((ushort)(0x41 + (letter - 'A')));
                            }
                            i++;
                        }
                    }
                }
                else if (c == '+') {
                    // Shift+char - just type the char for simplicity
                    i++;
                    if (i < cmd.Length) {
                        TypeChar(cmd[i]);
                        i++;
                    }
                }
                else {
                    TypeChar(c);
                    i++;
                }
            }
            stdout.WriteLine("OK");
        } catch (Exception ex) {
            Console.Error.WriteLine("Error: " + ex.Message);
            stdout.WriteLine("ERR");
        }
    }

    [STAThread]
    public static void Main() {
        blockUserKeyboardInput = string.Equals(
            Environment.GetEnvironmentVariable("FT_BLOCK_USER_INPUT"),
            "1",
            StringComparison.Ordinal
        );

        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;
        var stdout = new StreamWriter(Console.OpenStandardOutput(), Encoding.UTF8);
        stdout.AutoFlush = true;

        StartUserInputMonitor();
        
        stdout.WriteLine("READY");

        try {
            string line;
            while ((line = Console.ReadLine()) != null) {
                if (line == "__EXIT__") break;
                if (line == "__PING__") { stdout.WriteLine("OK"); continue; }
                ProcessCommand(line, stdout);
            }
        } finally {
            StopUserInputMonitor();
        }
    }
}
