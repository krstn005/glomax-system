from django.core.management.base import BaseCommand

from adminconfig.models import Faq

# (question, answer) - shown to customers in this order
FAQS = [
    # --- Getting started ---
    (
        'What is Glomax Solar Enterprises?',
        'Glomax Solar Enterprises is a solar company. This website lets you send a request for a roof assessment, '
        'follow its progress, and get your approved quotation and Disclosure Agreement online.',
    ),
    (
        'How do I send a request?',
        'Log in to your account and click New Request. Fill in your name, phone number and property address, '
        'then choose the solar package you want. Check your details and submit. You will get a reference number '
        'that looks like GLX-0001.',
    ),
    (
        'Do I need an account to send a request?',
        'Yes. You need a customer account so we can send your updates and keep all your requests in one place. '
        'Creating an account is free.',
    ),
    (
        'Can I send more than one request at the same time?',
        'No. You can only have one request in progress at a time. You can send a new one after your current '
        'request is completed, withdrawn, or marked Not Compatible.',
    ),
    # --- The assessment ---
    (
        'What happens after I send my request?',
        'Our team reviews it and assigns a Partner Installer. The installer visits your property and checks '
        'your roof. Then our team reviews the results, and the Admin gives the final approval. You will see '
        'each step on the Request Status page.',
    ),
    (
        'Who will visit my property?',
        'A Partner Installer assigned by our team. You can see the installer\'s name and the visit date on '
        'your Request Status page once they are assigned.',
    ),
    (
        'Do I need to be home on the visit date?',
        'Yes, please. Someone should be home so the installer can enter the property and check your roof.',
    ),
    (
        'Can I change my visit date?',
        'Yes. On the Request Status page, click Request Reschedule while your visit is still scheduled. '
        'Pick a new date and send it. Our team will review it, and you will get a notification when they '
        'approve or decline.',
    ),
    # --- Results ---
    (
        'How long does it take to get an answer?',
        'Our team usually reviews new requests within 1-2 business days. The full process depends on the '
        'visit date and the review. You can always check your Request Status page for the latest step.',
    ),
    (
        'What does Approved mean?',
        'Approved means our team finished the review and confirmed your final price. Your Disclosure Agreement '
        'is ready, and you can download it as a PDF from the Request Status page. We will also contact you '
        'about the next steps.',
    ),
    (
        'What does Not Compatible mean?',
        'It means your property cannot be used for the solar system you asked for. The reason is shown on your '
        'Request Status page. In some cases you can fix the problem and reapply, and in other cases you '
        'cannot proceed.',
    ),
    # --- Changes ---
    (
        'Can I cancel my request?',
        'Yes. You can withdraw a request from your Dashboard while it is still waiting to be reviewed. '
        'A withdrawn request can be reapplied later.',
    ),
    (
        'How do I reapply?',
        'If your request was withdrawn, or marked Not Compatible with the option to reapply, open Request '
        'Status and click Reapply. Your old details are filled in, and you can change anything. You keep the '
        'same reference number, and your earlier try is saved in the history.',
    ),
    (
        'Why is the price on my request called an estimate?',
        'Until your roof is checked and approved, the price is only an estimate from your package or quotation. '
        'After approval, the final price is shown as the Total Price and is written in your Disclosure Agreement.',
    ),
    # --- Account and updates ---
    (
        'How will I know when something changes?',
        'You will get a notification inside the website. You can also choose to get updates by email or text '
        'message in your account Settings.',
    ),
    (
        'I forgot my password. What should I do?',
        'On the login page, click Forgot Password and follow the steps. If you still cannot log in, contact us '
        'and we will help you.',
    ),
    (
        'How can I contact Glomax Solar?',
        'You can send us an inquiry through the website, or reach us with the contact details shown on our '
        'website. We will reply as soon as we can.',
    ),
    # --- Packages ---
    (
        'What solar packages do you offer?',
        'We offer 3KW, 6KW, 8KW and 10KW packages. Each size comes in two system types: On-Grid and Hybrid. '
        'You can see every package, its short description and its price when you send a New Request.',
    ),
    (
        'What is the difference between On-Grid and Hybrid?',
        'An On-Grid system is connected to the utility grid and is the more affordable option. A Hybrid system '
        'is connected to the grid and also has a battery for backup, so it can keep working during a power outage.',
    ),
    (
        'Which package is right for my home?',
        'It depends on how much electricity you use. As a simple guide, 3KW fits small households, 6KW fits '
        'medium households, and 8KW fits bigger homes with high energy use. The 10KW package is meant for small '
        'commercial properties or large homes. Your roof assessment will confirm what really fits your property.',
    ),
    (
        'Which package should I pick if I want backup power?',
        'Choose a Hybrid package. The 3KW Hybrid is for homes that want backup during power outages, and the '
        '6KW, 8KW and 10KW Hybrid packages are for larger homes and businesses that need more backup power.',
    ),
    (
        'Can I change my package after I send my request?',
        'You can ask our team to adjust it. After the roof assessment, the installer also recommends a package '
        'based on your roof, and our team shares the final system and price with you. If you want to change it '
        'before then, you can withdraw your request and reapply with a different package.',
    ),
    (
        'How much does each package cost?',
        'The price of every package is shown on the New Request page when you choose your package. Please note '
        'that the first price is an estimate. Your final price is confirmed after the roof assessment and approval.',
    ),
    # --- About the system ---
    (
        'What does the roof assessment check?',
        'The Partner Installer checks your roof type and condition, the roof area, and how much solar capacity '
        'fits. They also note the number of solar panels and the inverter size. They take photos during the visit '
        'as proof, and our team uses all of this to make your quotation.',
    ),
    (
        'What is a quotation?',
        'A quotation is the price offer we send you for your solar package. You may first receive an initial '
        'quotation, and later an updated one if something changes after the assessment. The latest quotation is '
        'the one used for your final approval.',
    ),
    (
        'What is a Disclosure Agreement?',
        'It is the document you get once your request is approved. It shows your final price and payment terms. '
        'You can download it as a PDF from your Request Status page, and we also send it to your email.',
    ),
    (
        'What is a Partner Installer?',
        'A Partner Installer is a trained worker or team that works with Glomax Solar. They visit your property, '
        'check your roof and send the assessment to our team.',
    ),
    (
        'What is the reference number (like GLX-0001)?',
        'It is the number of your request. Use it whenever you contact us, so we can find your request quickly. '
        'If you reapply, you keep the same number.',
    ),
    (
        'Is this website where I pay or where the installation happens?',
        'No. This website is for sending your request, the roof assessment, your quotation and the approval. '
        'After your request is approved, our team will contact you about the next steps.',
    ),
    (
        'Can I leave feedback?',
        'Yes. Once your request is marked as completed, a Leave Feedback button shows up on your Request '
        'Status page. You can give a star rating and a short comment.',
    ),
]


class Command(BaseCommand):
    help = (
        'Adds ready-made FAQs for customers. '
        'Safe to run many times: a question that already exists is skipped.'
    )

    def handle(self, *args, **options):
        added = 0
        skipped = 0
        for position, (question, answer) in enumerate(FAQS, start=1):
            if Faq.objects.filter(question=question).exists():
                skipped += 1
                self.stdout.write('Skipped (already there): ' + question)
                continue
            Faq.objects.create(
                question=question,
                answer=answer,
                order=position,
                is_published=True,
            )
            added += 1
            self.stdout.write('Added: ' + question)
        self.stdout.write(self.style.SUCCESS(
            'Done. Added %d, skipped %d.' % (added, skipped)
        ))
