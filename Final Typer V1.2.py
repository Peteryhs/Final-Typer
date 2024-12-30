from cProfile import label
from zipfile import error

import pyautogui
import time
import random
import re
from collections import Counter
import customtkinter
import tkinter
import os

#Text stats
def text_analysis(text):
    if not text:
        return {
            "word_count": 0,
            "unique_word_count": 0,
            "character_count": 0,
            "average_word_length": 0,
            "letter_frequency": {},
            "word_frequency": {},
            "sentence_count": 0
        }

    words = re.findall(r"[\w']+|[.,!?;:]+", text.lower())
    word_count = len(words)
    unique_word_count = len(set(words))
    character_count = len(text)
    total_word_length = sum(len(word) for word in words)
    average_word_length = total_word_length / word_count if word_count > 0 else 0
    letters = re.findall(r'[a-z]', text.lower())
    letter_frequency = dict(Counter(letters))
    word_frequency = dict(Counter(words))
    sentences = re.split(r'([.!?]+)', text)
    sentences = [''.join(i) for i in zip(sentences[::2], sentences[1::2] + [''] * (len(sentences[::2]) - len(sentences[1::2])))]
    sentences = [s.strip() for s in sentences if s.strip()]
    sentence_count = len(sentences)

    return {
        "word_count": word_count,
        "unique_word_count": unique_word_count,
        "character_count": character_count,
        "average_word_length": average_word_length,
        "letter_frequency": letter_frequency,
        "word_frequency": word_frequency,
        "sentence_count": sentence_count
    }

#Mistake stats
def mistake_analysis(speed, text_analysis_results):
    base_rate = (float(speed) / 200) * 0.05
    word_complexity = text_analysis_results["average_word_length"] / 5
    vocabulary_complexity = text_analysis_results["unique_word_count"] * 10 / text_analysis_results["word_count"] if text_analysis_results["word_count"] > 0 else 1
    difficult_letters = {'z', 'q', 'x', 'j', 'k', 'v', 'b', 'p'}
    total_letters = sum(text_analysis_results["letter_frequency"].values())
    difficult_letter_count = sum(text_analysis_results["letter_frequency"].get(letter, 0) for letter in difficult_letters)
    letter_difficulty = (difficult_letter_count + total_letters) / total_letters
    mistake_rate = base_rate * (word_complexity + vocabulary_complexity + letter_difficulty) / 10
    return mistake_rate

#Typing simulation
def simulate_typing(text, typing_speed, analysis_results, mistake_rate, fatigue_mode):
    print(f"Error rate: {mistake_rate}, Fatigue mode: {fatigue_mode}, Typing speed: {typing_speed}")
    base_delay = (60 / (typing_speed * 7)) *0.5
    chars_typed = 0
    output = ""

    common_words = {
        'the': 0.025, 'be': 0.025, 'to': 0.025, 'of': 0.025, 'and': 0.025,
        'a': 0.015, 'in': 0.025, 'that': 0.03, 'have': 0.03, 'i': 0.015,
        'it': 0.025, 'for': 0.025, 'not': 0.025, 'on': 0.02, 'with': 0.03,
        'he': 0.02, 'as': 0.02, 'you': 0.025, 'do': 0.02, 'at': 0.02,
        'this': 0.03, 'but': 0.025, 'his': 0.025, 'by': 0.02, 'from': 0.03,
        'they': 0.03, 'we': 0.02, 'say': 0.025, 'her': 0.025, 'she': 0.025,
        'or': 0.02, 'an': 0.02, 'will': 0.03, 'my': 0.02, 'one': 0.025,
        'all': 0.025, 'would': 0.035, 'there': 0.03, 'their': 0.03, 'what': 0.03,
        'so': 0.02, 'up': 0.02, 'out': 0.025, 'if': 0.02, 'about': 0.003,
        'who': 0.025, 'get': 0.025, 'which': 0.03, 'go': 0.02, 'me': 0.02,
        'is': 0.02, 'are': 0.025, 'was': 0.025, 'were': 0.03
    }

    def get_word_difficulty(word):
        word_length_factor = (len(word) / analysis_results["average_word_length"]) * 1.5
        frequency_factor = 1.5 if word.lower() not in analysis_results["word_frequency"] else 1.0
        return word_length_factor * frequency_factor

    #Common words = faster typing
    def get_nearby_key(char):
        keyboard_layout = {
            'q': 'wa', 'w': 'qeasd', 'e': 'wrsdf', 'r': 'etdfg', 't': 'ryfgh',
            'y': 'tughj', 'u': 'yihjk', 'i': 'uojkl', 'o': 'ipkl;', 'p': 'o[l;\'',
            'a': 'qwsz', 's': 'wedxza', 'd': 'erfcxs', 'f': 'rtgvcx', 'g': 'tyhbvf',
            'h': 'yujnbg', 'j': 'uikmnh', 'k': 'iolmj', 'l': 'op;,k',
            'z': 'asx', 'x': 'sdc', 'c': 'dfv', 'v': 'fgb', 'b': 'ghn',
            'n': 'hjm', 'm': 'jk,',
            "'": "\"[];",
            '"': "'[];",
            ';': 'l,.',
            ':': ';',
        }
        if char.lower() in keyboard_layout:
            return random.choice(keyboard_layout[char.lower()])
        return char

    def simulate_mistake(char):
        if char in "'\"":
            mistake_types = {
                'typo': lambda c: random.choice(['"', "'", '[', ']', ';']),
                'skip': lambda c: '',
                'double': lambda c: c + c
            }
            weights = [0.4, 0.3, 0.3]
        else:
            mistake_types = {
                'typo': lambda c: random.choice('qwertyuiop[]asdfghjkl;\'zxcvbnm,./'),
                'skip': lambda c: '',
                'double': lambda c: c + c,
                'swap': lambda c: c + (text[chars_typed + 1] if chars_typed + 1 < len(text) else ''),
                'nearby': lambda c: get_nearby_key(c)
            }
            weights = [0.4, 0.2, 0.2, 0.1, 0.1]
        mistake_type = random.choices(list(mistake_types.keys()), weights=weights)[0]
        return mistake_types[mistake_type](char)

    #Thinking
    def natural_pause(word):
        if word.endswith((".", "!", "?")):
            return random.uniform(0.8, 2.5)
        elif word.endswith((',', ';', ':', '"', "'")):
            return random.uniform(0.2, 0.5)
        elif get_word_difficulty(word) > 1.5:
            return random.uniform(0.01, 0.03)
        elif random.randint(1, 500) <= 5:
            return random.uniform(8, 15)
        return random.uniform(0.00001, 0.00005)

    def safe_write(char):
        #why can't pyautogui tell the difference between ' and ’
        if char == '“':
            pyautogui.write('"')
        elif char == '”':
            pyautogui.write('"')
        elif char == '‘':
            pyautogui.write("'")
        elif char == '’':
            pyautogui.write("'")
        else:
            pyautogui.write(char)

    words = text.split()
    print(words)
    current_word_index = 0
    current_sentence = ""
    current_word = ""
    last_char_space = True
    start_time = time.time()

    for i, char in enumerate(text):
        current_sentence += char
        if char.isalpha():
            current_word += char.lower()
            last_char_space = False
        elif char.isspace() or char in '.,!?;:\'"':
            if current_word.lower() in common_words:
                current_delay = base_delay * common_words[current_word.lower()]
            else:
                current_delay = base_delay
            current_word = ""
            last_char_space = True
            if char in '"\'':
                current_delay *= 1.2


        chars_typed += 1

        if char.isspace() or i == len(text) - 1:
            if current_word_index < len(words):
                pause_time = natural_pause(words[current_word_index])
                time.sleep(pause_time)
                current_word_index += 1

        if random.uniform(0,1) < mistake_rate:

            typo = simulate_mistake(char)
            output += typo
            safe_write(typo)
            if random.random() < 0.8:
                time.sleep(random.uniform(0.1, 0.3))
                for _ in range(len(typo)):
                    pyautogui.press('backspace')
                    time.sleep(0.05)
                output = output[:-len(typo)]
                safe_write(char)
                output += char
        else:
            safe_write(char)
            output += char

        variance = random.uniform(0.6, 1.4)
        if fatigue_mode == 1:

            time.sleep(base_delay* variance*(chars_typed*0.001 +1))
        else:

            time.sleep(base_delay  * variance)

        print("delay: ", base_delay * variance)

    end_time = time.time()
    elapsed_time = end_time - start_time
    print(f"Typing simulation completed in {elapsed_time:.2f} seconds")

    return output

def change_theme(choice):
    customtkinter.set_appearance_mode("light" if choice == "Light" else "dark")

def config_setting(choice):
    if choice == "Simple":
        simple_frame.grid(row =4, column = 1, padx = 20, sticky = "ew")
        advanced_frame.grid_forget()
    else:
        advanced_frame.grid(row = 4, column = 1, padx = 20, sticky = "ews")
        simple_frame.grid_forget()

#GUI Code order reformatted by O1
app = customtkinter.CTk()
app.geometry("1000x600")
app.title("Final Typer")



# Configure grid layout for the app window
app.columnconfigure(0, weight=0)
app.columnconfigure(1, weight=1)
app.rowconfigure(0, weight=1)

# Side Frame (Navigation Panel)
side_frame = customtkinter.CTkFrame(app, width=200, fg_color="#333333")
side_frame.grid(row=0, column=0, sticky="nswe")
side_frame.grid_propagate(False)
side_frame.columnconfigure(0, weight=1)

# Widgets in side_frame
name = customtkinter.CTkLabel(
    side_frame, text="Final Typer", font=("Arial", 30), text_color="#f0f0f0")
credits = customtkinter.CTkLabel(
    side_frame, text="Version 1.2.0", font=("Arial", 15), text_color="#f0f0f0")
theme_menu = customtkinter.CTkOptionMenu(
    side_frame, values=["Dark", "Light"], command = change_theme)
text_stats = customtkinter.CTkLabel(
    side_frame, text="Text Stats", font=("Arial", 15), text_color="#f0f0f0")
statsframe = customtkinter.CTkFrame(side_frame, border_width=1, border_color="#f0f0f0")
stats_content = customtkinter.CTkLabel(
    statsframe, text="", font=("Arial", 12),  anchor="w", justify="left")

# Place widgets in side_frame
name.grid(row=0, column=0, padx=20, pady=(50, 10))
credits.grid(row=1, column=0, padx=20, pady=(0, 10))
theme_menu.grid(row=2, column=0, padx=20, pady=(0, 290))
text_stats.grid(row=3, column=0, padx=20, pady=(10, 5), sticky="w")
statsframe.grid(row=4, column=0, padx=20, pady=(0, 20), sticky="ew" + "ns")
stats_content.grid(row=0, column=0, padx=10, pady=(10, 5), sticky="ew")
side_frame.rowconfigure(4, weight=1)

# Main Content Frame
main_frame = customtkinter.CTkFrame(app)
main_frame.grid(row=0, column=1, sticky="nswe")
main_frame.columnconfigure(0, weight=1)
main_frame.rowconfigure(0, weight=1)
main_frame.rowconfigure(1, weight=0)
main_frame.rowconfigure(2, weight=0)
main_frame.rowconfigure(3, weight=0)

# Text input
textinput = customtkinter.CTkTextbox(main_frame)
textinput.grid(row=0, column=0, padx=20, pady=(20, 10), sticky="nswe")


# Configuration Mode Switch
config_mode = customtkinter.CTkSegmentedButton(
    main_frame, values=["Simple", "Advanced"])


config_mode.grid(row=1, column=0, padx=20, pady=10, sticky="ew")

# Simple Mode Frame
simple_frame = customtkinter.CTkFrame(main_frame)
wpm_simple = tkinter.IntVar(value=20)
wpm_slider_simple = customtkinter.CTkSlider(
    simple_frame, variable=wpm_simple, from_=20, to=200
)
simple_slider_label = customtkinter.CTkLabel(
    simple_frame, text=f"WPM: {wpm_simple.get()}", width=100
)

# Place widgets in simple_frame
simple_frame.columnconfigure(1, weight=1)
simple_slider_label.grid(row=0, column=0, padx=10, pady=5, sticky="w")
wpm_slider_simple.grid(row=0, column=1, padx=10, pady=5, sticky="ew")

# Advanced Mode Frame
advanced_frame = customtkinter.CTkFrame(main_frame)
wpm_advanced = tkinter.StringVar()
wpm_entry_advanced = customtkinter.CTkEntry(
    advanced_frame, placeholder_text="WPM", width=100, textvariable=wpm_advanced
)
advanced_label = customtkinter.CTkLabel(advanced_frame, text="WPM")
error_rate = tkinter.StringVar()
error_rate_entry = customtkinter.CTkEntry(advanced_frame, width=100, textvariable=error_rate)

error_label = customtkinter.CTkLabel(advanced_frame, text="Error rate")
fatigue_var = tkinter.IntVar()
fatigue_checkbox = customtkinter.CTkCheckBox(
    advanced_frame, text="Fatigue mode", variable=fatigue_var, onvalue=1, offvalue=0
)

# Place widgets in advanced_frame
advanced_frame.columnconfigure(1, weight=1)
advanced_label.grid(row=0, column=0, padx=10, pady=5, sticky="w")
wpm_entry_advanced.grid(row=0, column=1, padx=10, pady=5, sticky="ew")
error_label.grid(row=1, column=0, padx=10, pady=5, sticky="w")
error_rate_entry.grid(row=1, column=1, padx=10, pady=5, sticky="ew")
fatigue_checkbox.grid(row=2, column=0, columnspan=2, padx=10, pady=5, sticky="w")

# Function to switch between Simple and Advanced modes
def config_setting(mode):
    if mode == "Simple":
        advanced_frame.grid_forget()
        simple_frame.grid(row=2, column=0, padx=20, pady=10, sticky="ew")
    else:
        simple_frame.grid_forget()
        advanced_frame.grid(row=2, column=0, padx=20, pady=10, sticky="ew")

config_mode.configure(command=config_setting)




def update_slider_label(value):
    simple_slider_label.configure(text=f"WPM: {int(float(value))}")

wpm_slider_simple.configure(command=update_slider_label)

# Buttons at the bottom
button_frame = customtkinter.CTkFrame(main_frame)
button_frame.grid(row=3, column=0, padx=20, pady=10, sticky="ew")
button_frame.columnconfigure(0, weight=1)
button_frame.columnconfigure(1, weight=1)

stats_button = customtkinter.CTkButton(button_frame, text="Get Stats of Text")
begin_button = customtkinter.CTkButton(button_frame, text="Start Typing (3s Delay)")

stats_button.grid(row=0, column=0, padx=10, pady=5, sticky="ew")
begin_button.grid(row=0, column=1, padx=10, pady=5, sticky="ew")

def display_stats():
    text = textinput.get("1.0", "end-1c")
    analysis_results = text_analysis(text)
    stats_text = (
        f"Word Count: {analysis_results['word_count']}\n"
        f"Unique Words: {analysis_results['unique_word_count']}\n"
        f"Avg Word Length: {analysis_results['average_word_length']:.2f}\n"
        f"Sentence Count: {analysis_results['sentence_count']}\n"
    )
    stats_content.configure(text=stats_text)

def trigger_typing():



    text = textinput.get("1.0", "end-1c")
    speed = wpm_simple.get() if config_mode.get() == "Simple" else float(wpm_advanced.get())
    analysis_results = text_analysis(text)

    if config_mode.get() == "Advanced":
        print(error_rate)
        mistake_rate = float(error_rate.get()) / 100
    else:
        mistake_rate = mistake_analysis(speed, analysis_results)
    time.sleep(3)
    simulate_typing(text, speed, analysis_results, mistake_rate, fatigue_var.get())



stats_button.configure(command=display_stats)
begin_button.configure(command=trigger_typing)

# Load user data
if os.path.exists('data.txt'):
    data = {}
    with open('data.txt', 'r') as file:
        for line in file:
            key, value = line.split(':')
            data[key] = value
    print(data['Mode'])
    if data['Mode'] == ' Simple\n':
        print("Ok")
        config_mode.set("Simple")
        config_setting("Simple")
        wpm_simple.set(int(data['Speed']))
        simple_slider_label.configure(text=f"WPM: {wpm_simple.get()}")
    else:
        print("not ok")
        config_mode.set("Advanced")
        config_setting("Advanced")
        wpm_advanced.set(data['Speed'])
        error_rate.set(data['Error'])
        fatigue_var.set(int(data['Fatigue']))


else:
    config_mode.set("Simple")
    config_setting("Simple")

#Save user data
def save_data():
    speed = wpm_simple.get() if config_mode.get() == "Simple" else float(wpm_advanced.get())
    mode = config_mode.get()
    fatigue = fatigue_var.get()
    if config_mode.get() == "Advanced":
        error = error_rate.get()
    else:

        if textinput.get("1.0", "end-1c") == '' or textinput.get("1.0", "end-1c") == ' ':
            error = 0
        else:
            error = mistake_analysis(speed, text_analysis(text))

    with open('data.txt', 'w') as file:
        file.write(f"Speed: {speed}\nMode: {mode}\nFatigue: {fatigue}\nError: {error}")


def on_closing():
    save_data()
    app.destroy()


app.protocol("WM_DELETE_WINDOW", on_closing)

app.mainloop()
