import Layout from "@/components/Layout";
import { getError } from "@/utils/error";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useReducer, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";

function reducer(state, action) {
  switch (action.type) {
    case "FETCH_REQUEST":
      return { ...state, loading: true, error: "" };
    case "FETCH_SUCCESS":
      return { ...state, loading: false, error: "" };
    case "FETCH_FAIL":
      return { ...state, loading: false, error: action.payload };
    case "UPDATE_REQUEST":
      return { ...state, loadingUpdate: true, errorUpdate: "" };
    case "UPDATE_SUCCESS":
      return { ...state, loadingUpdate: false, errorUpdate: "" };
    case "UPDATE_FAIL":
      return { ...state, loadingUpdate: false, errorUpdate: action.payload };
    case "UPLOAD_REQUEST":
      return { ...state, loadingUpload: true, errorUpload: "" };
    case "UPLOAD_SUCCESS":
      return { ...state, loadingUpload: false, errorUpload: "" };
    case "UPLOAD_FAIL":
      return { ...state, loadingUpload: false, errorUpload: action.payload };
    default:
      return state;
  }
}

export default function ProductEditScreen() {
  const router = useRouter();
  const { query } = router;
  const productId = query.id;
  const [{ loading, error, loadingUpdate, loadingUpload }, dispatch] = useReducer(reducer, {
    loading: true,
    error: "",
  });
  const [csrfToken, setCsrfToken] = useState("");
  const { register, handleSubmit, setValue, formState: { errors } } = useForm();

  useEffect(() => {
    const fetchData = async () => {
      const { data: csrf } = await axios.get("/api/auth/csrf-token");
      setCsrfToken(csrf.csrfToken);
      try {
        dispatch({ type: "FETCH_REQUEST" });
        const { data } = await axios.get(`/api/admin/products/${productId}`);
        dispatch({ type: "FETCH_SUCCESS" });
        setValue("name", data.name);
        setValue("slug", data.slug);
        setValue("price", data.price);
        setValue("image", data.image);
        setValue("category", data.category);
        setValue("brand", data.brand);
        setValue("countInStock", data.countInStock);
        setValue("description", data.description);
      } catch (error) {
        dispatch({ type: "FETCH_FAIL", payload: getError(error) });
      }
    };
    if (productId) fetchData();
  }, [productId, setValue]);

  const submitHandler = async ({
    name,
    slug,
    price,
    category,
    image,
    brand,
    countInStock,
    description,
  }) => {
    try {
      dispatch({ type: "UPDATE_REQUEST" });
      await axios.put(
        `/api/admin/products/${productId}`,
        { name, slug, price, category, image, brand, countInStock, description },
        { headers: { "x-csrf-token": csrfToken } }
      );
      dispatch({ type: "UPDATE_SUCCESS" });
      toast.success("Product updated successfully");
      router.push("/admin/products");
    } catch (error) {
      dispatch({ type: "UPDATE_FAIL", payload: getError(error) });
      toast.error(getError(error));
    }
  };

  const uploadHandler = async (e, imageField = "image") => {
    const url = `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/upload`;
    try {
      dispatch({ type: "UPLOAD_REQUEST" });
      const { data: { signature, timestamp } } = await axios("/api/admin/cloudinary-sign");
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("signature", signature);
      formData.append("timestamp", timestamp);
      formData.append("api_key", process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY);
      const { data } = await axios.post(url, formData);
      dispatch({ type: "UPLOAD_SUCCESS" });
      setValue(imageField, data.secure_url);
      toast.success("File uploaded successfully");
    } catch (error) {
      dispatch({ type: "UPLOAD_FAIL", payload: getError(error) });
      toast.error(getError(error));
    }
  };

  return (
    <Layout title={`Edit Product ${productId}`}>
      <div className="grid md:grid-cols-4 md:gap-5">
        <div>
          <ul className="leading-9">
            <li><Link href="/admin/dashboard">Dashboard</Link></li>
            <li><Link href="/admin/orders">Orders</Link></li>
            <li className="flex items-center whitespace-nowrap font-bold text-blue-700">
              <Link className="font-bold" href="/admin/products">Products</Link>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </li>
            <li><Link href="/admin/users">Users</Link></li>
          </ul>
        </div>
        <div className="md:col-span-3">
          {loading ? (
            <div>Loading...</div>
          ) : error ? (
            <div className="alert-error">{error}</div>
          ) : (
            <form className="mx-auto max-w-screen-md" onSubmit={handleSubmit(submitHandler)}>
              <h1 className="mb-4 text-xl">{`Edit Product ${productId}`}</h1>
              {[
                { name: "name", label: "Name" },
                { name: "slug", label: "Slug" },
                { name: "price", label: "Price" },
                { name: "category", label: "Category" },
                { name: "brand", label: "Brand" },
                { name: "countInStock", label: "Count in stock" },
                { name: "description", label: "Description" },
              ].map(({ name, label }) => (
                <div className="mb-4" key={name}>
                  <label htmlFor={name}>{label}</label>
                  <input
                    type="text"
                    {...register(name, { required: `Please enter ${label.toLowerCase()}` })}
                    className="w-full"
                    id={name}
                  />
                  {errors[name] && <div className="text-red-500">{errors[name].message}</div>}
                </div>
              ))}
              <div className="mb-4">
                <label htmlFor="imageFile">Upload image</label>
                <input type="file" className="w-full" id="imageFile" onChange={uploadHandler} />
                {loadingUpload && <div>Uploading....</div>}
              </div>
              <input type="hidden" value={csrfToken} {...register("csrfToken")} />
              <div className="mb-4">
                <button disabled={loadingUpdate} className="primary-button">
                  {loadingUpdate ? "Loading..." : "Update"}
                </button>
              </div>
              <div className="mb-4">
                <Link href={`/admin/products`}>Back</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </Layout>
  );
}

ProductEditScreen.auth = { adminOnly: true };
