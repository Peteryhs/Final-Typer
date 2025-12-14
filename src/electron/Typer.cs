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

    // Simple key press with minimal delay
    private static void PressKey(ushort vk, bool extended = false) {
        var input = new INPUT[2];
        
        // Key down
        input[0].type = INPUT_KEYBOARD;
        input[0].u.ki.wVk = vk;
        input[0].u.ki.wScan = 0;
        input[0].u.ki.dwFlags = extended ? KEYEVENTF_EXTENDEDKEY : 0;
        input[0].u.ki.time = 0;
        input[0].u.ki.dwExtraInfo = IntPtr.Zero;
        
        // Key up
        input[1].type = INPUT_KEYBOARD;
        input[1].u.ki.wVk = vk;
        input[1].u.ki.wScan = 0;
        input[1].u.ki.dwFlags = KEYEVENTF_KEYUP | (extended ? KEYEVENTF_EXTENDEDKEY : 0);
        input[1].u.ki.time = 0;
        input[1].u.ki.dwExtraInfo = IntPtr.Zero;
        
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
        input[0].u.ki.dwExtraInfo = IntPtr.Zero;
        
        // Key up
        input[1].type = INPUT_KEYBOARD;
        input[1].u.ki.wVk = 0;
        input[1].u.ki.wScan = (ushort)c;
        input[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        input[1].u.ki.time = 0;
        input[1].u.ki.dwExtraInfo = IntPtr.Zero;
        
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
        
        // Key down
        input[1].type = INPUT_KEYBOARD;
        input[1].u.ki.wVk = vk;
        input[1].u.ki.dwFlags = extended ? KEYEVENTF_EXTENDEDKEY : 0;
        
        // Key up
        input[2].type = INPUT_KEYBOARD;
        input[2].u.ki.wVk = vk;
        input[2].u.ki.dwFlags = KEYEVENTF_KEYUP | (extended ? KEYEVENTF_EXTENDEDKEY : 0);
        
        // Ctrl up
        input[3].type = INPUT_KEYBOARD;
        input[3].u.ki.wVk = VK_CONTROL;
        input[3].u.ki.dwFlags = KEYEVENTF_KEYUP;
        
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
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;
        var stdout = new StreamWriter(Console.OpenStandardOutput(), Encoding.UTF8);
        stdout.AutoFlush = true;
        
        stdout.WriteLine("READY");
        
        string line;
        while ((line = Console.ReadLine()) != null) {
            if (line == "__EXIT__") break;
            if (line == "__PING__") { stdout.WriteLine("OK"); continue; }
            ProcessCommand(line, stdout);
        }
    }
}
