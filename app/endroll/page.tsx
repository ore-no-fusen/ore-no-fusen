import EndrollMatsuri from '../components/EndrollMatsuri';

export const metadata = {
    title: '奉納帳',
};

export default function EndrollPage() {
    return (
        <main className="min-h-screen bg-neutral-100 px-6 py-10 flex items-center justify-center">
            <EndrollMatsuri />
        </main>
    );
}
