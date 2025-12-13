using System;
using System.Text;
using System.IO;
using System.Windows.Forms;

public class Typer {
    [STAThread]
    public static void Main() {
        // Node writes UTF-8 to stdin; ensure we decode it as UTF-8 so “smart quotes”
        // (and any other unicode chars) don't get mangled into sequences like "â€™".
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;

        // Ensure Electron can reliably read per-command acknowledgements.
        var stdout = new StreamWriter(Console.OpenStandardOutput(), Encoding.UTF8) {
            AutoFlush = true
        };

        stdout.WriteLine("READY");

        string line;
        while ((line = Console.ReadLine()) != null) {
            if (line == "__EXIT__") break;
            if (line == "__PING__") {
                stdout.WriteLine("OK");
                continue;
            }
            try {
                SendKeys.SendWait(line);
                stdout.WriteLine("OK");
            } catch (Exception) {
                // SendKeys can throw if the payload contains invalid tokens.
                stdout.WriteLine("ERR");
            }
        }
    }
}
