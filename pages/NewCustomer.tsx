import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useCompany } from '../context/CompanyContext';

const IMGBB_API_KEY = "c9f4edabbd1fe1bc3a063e26bc6a2ecd";

const NewCustomer: React.FC = () => {
    const navigate = useNavigate();
    const { currentCompany } = useCompany();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);

    const [formData, setFormData] = useState({
        fullName: '',
        mobile: '',
        email: '',
        address: '',
        aadhaar: '',
        pan: '',
        voterId: '',
        guarantorName: '',
        guarantorRelation: '',
        guarantorMobile: '',
        guarantorAddress: ''
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setPhotoPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const uploadPhoto = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append("image", file);

        try {
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                return data.data.url;
            } else {
                throw new Error(data.error?.message || "Upload failed");
            }
        } catch (error) {
            console.error("Image upload error:", error);
            alert("Photo upload failed. Proceeding without photo.");
            return "";
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth.currentUser) return;
        if (!currentCompany) return alert("Please select a company first");

        if (!formData.fullName) return alert("Full Name is required");
        if (!formData.mobile) return alert("Mobile Number is required");

        setIsSubmitting(true);

        try {
            let photoUrl = "";
            if (photoFile) {
                photoUrl = await uploadPhoto(photoFile);
            }

            await addDoc(collection(db, 'customers'), {
                name: formData.fullName,
                phone: formData.mobile,
                email: formData.email,
                address: formData.address,
                aadhaar: formData.aadhaar,
                pan: formData.pan,
                voterId: formData.voterId,
                photo_url: photoUrl,
                status: 'Active', // Default status
                createdAt: new Date().toISOString(),
                createdBy: auth.currentUser.uid,
                companyId: currentCompany.id,
                guarantor: {
                    name: formData.guarantorName,
                    relation: formData.guarantorRelation,
                    mobile: formData.guarantorMobile,
                    address: formData.guarantorAddress
                }
            });

            alert("Customer Registered Successfully!");
            navigate('/customers');

        } catch (error) {
            console.error("Registration failed:", error);
            alert("Failed to register customer. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                    <span className="font-bold text-sm hidden sm:inline">Back</span>
                </button>
                <h1 className="text-lg font-bold">New Customer</h1>
                <div className="w-10"></div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-6">
                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* Personal Details */}
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="font-bold text-base flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">person</span>
                                Personal Details
                            </h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Full Name *</label>
                                <input
                                    type="text" name="fullName" required
                                    value={formData.fullName} onChange={handleInputChange}
                                    placeholder="e.g. Rahul Kumar"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Mobile Number *</label>
                                <input
                                    type="tel" name="mobile" required
                                    value={formData.mobile} onChange={handleInputChange}
                                    placeholder="e.g. 9876543210"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Email Address</label>
                                <input
                                    type="email" name="email"
                                    value={formData.email} onChange={handleInputChange}
                                    placeholder="Optional"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Full Address</label>
                                <textarea
                                    name="address"
                                    value={formData.address} onChange={handleInputChange}
                                    placeholder="House No, Street, City, State"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none resize-none h-24"
                                ></textarea>
                            </div>
                        </div>
                    </div>

                    {/* KYC Details */}
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="font-bold text-base flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">badge</span>
                                KYC Information
                            </h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Aadhaar Number</label>
                                <input
                                    type="text" name="aadhaar"
                                    value={formData.aadhaar} onChange={handleInputChange}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">PAN Number</label>
                                <input
                                    type="text" name="pan"
                                    value={formData.pan} onChange={handleInputChange}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Voter ID</label>
                                <input
                                    type="text" name="voterId"
                                    value={formData.voterId} onChange={handleInputChange}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Guarantor Details */}
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="font-bold text-base flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">verified_user</span>
                                Guarantor Details
                            </h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Guarantor Name</label>
                                <input
                                    type="text" name="guarantorName"
                                    value={formData.guarantorName} onChange={handleInputChange}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Relation</label>
                                <input
                                    type="text" name="guarantorRelation"
                                    value={formData.guarantorRelation} onChange={handleInputChange}
                                    placeholder="e.g. Father, Brother"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Mobile Number</label>
                                <input
                                    type="tel" name="guarantorMobile"
                                    value={formData.guarantorMobile} onChange={handleInputChange}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Address</label>
                                <input
                                    type="text" name="guarantorAddress"
                                    value={formData.guarantorAddress} onChange={handleInputChange}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Photo Upload */}
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="font-bold text-base flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">add_a_photo</span>
                                Customer Photo
                            </h2>
                        </div>
                        <div className="p-6 flex flex-col sm:flex-row gap-6 items-center">
                            <div className="relative h-32 w-32 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden">
                                {photoPreview ? (
                                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="material-symbols-outlined text-slate-400 text-4xl">person</span>
                                )}
                            </div>
                            <div className="flex-1 w-full">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Upload Passport Size Photo</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoChange}
                                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                />
                                <p className="text-xs text-slate-400 mt-2">Recommended: JPG/PNG, Max 2MB.</p>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-4 rounded-xl btn-kadak text-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <><div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div> Saving...</>
                        ) : (
                            <>Save Customer <span className="material-symbols-outlined material-symbols-fill">check_circle</span></>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default NewCustomer;